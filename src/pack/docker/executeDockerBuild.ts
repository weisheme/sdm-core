/*
 * Copyright © 2018 Atomist, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { HandlerContext } from "@atomist/automation-client";
import { GitProject } from "@atomist/automation-client/project/git/GitProject";
import { ExecuteGoal, GoalInvocation, PrepareForGoalExecution,
    SdmGoalEvent } from "@atomist/sdm";
import { spawnAndWatch } from "@atomist/sdm/api-helper/misc/spawned";
import { ExecuteGoalResult } from "@atomist/sdm/api/goal/ExecuteGoalResult";
import { ProjectLoader } from "@atomist/sdm/spi/project/ProjectLoader";
import { readSdmVersion } from "../../internal/delivery/build/local/projectVersioner";
import { postLinkImageWebhook } from "../../util/webhook/ImageLink";

export interface DockerOptions {
    registry: string;
    user: string;
    password: string;

    dockerfileFinder?: (p: GitProject) => Promise<string>;
}

export type DockerImageNameCreator = (p: GitProject,
                                      sdmGoal: SdmGoalEvent,
                                      options: DockerOptions,
                                      ctx: HandlerContext) => Promise<{ registry: string, name: string, version: string }>;

/**
 * Execute a Docker build for the project available from provided projectLoader
 * @param {ProjectLoader} projectLoader
 * @param {DockerImageNameCreator} imageNameCreator
 * @param {DockerOptions} options
 * @returns {ExecuteGoal}
 */
export function executeDockerBuild(projectLoader: ProjectLoader,
                                   imageNameCreator: DockerImageNameCreator,
                                   preparations: PrepareForGoalExecution[] = [],
                                   options: DockerOptions): ExecuteGoal {
    return async (goalInvocation: GoalInvocation): Promise<ExecuteGoalResult> => {
        const { sdmGoal, credentials, id, context, progressLog } = goalInvocation;

        return projectLoader.doWithProject({ credentials, id, context, readOnly: false }, async p => {

            for (const preparation of preparations) {
                const pResult = await preparation(p, goalInvocation);
                if (pResult.code !== 0) {
                    return pResult;
                }
            }

            const opts = {
                cwd: p.baseDir,
            };

            const spOpts = {
                errorFinder: code => code !== 0,
            };

            const imageName = await imageNameCreator(p, sdmGoal, options, context);
            const image = `${imageName.registry}/${imageName.name}:${imageName.version}`;
            const dockerfilePath = await (options.dockerfileFinder ? options.dockerfileFinder(p) : "Dockerfile");

            const loginArgs: string[] = ["login", "--username", options.user, "--password", options.password];
            if (/[^A-Za-z0-9]/.test(options.registry)) {
                loginArgs.push(options.registry);
            }

            // 1. run docker login
            let result = await spawnAndWatch(
                {
                    command: "docker",
                    args: loginArgs,
                },
                opts,
                progressLog,
                spOpts);

            if (result.code !== 0) {
                return result;
            }

            // 2. run docker build
            result = await spawnAndWatch(
                {
                    command: "docker",
                    args: ["build", ".", "-f", dockerfilePath, "-t", image],
                },
                opts,
                progressLog,
                spOpts);

            if (result.code !== 0) {
                return result;
            }

            // 3. run docker push
            result = await spawnAndWatch(
                {
                    command: "docker",
                    args: ["push", image],
                },
                opts,
                progressLog,
                spOpts);

            if (result.code !== 0) {
                return result;
            }

            // 4. create image link
            if (await postLinkImageWebhook(
                sdmGoal.repo.owner,
                sdmGoal.repo.name,
                sdmGoal.sha,
                image,
                context.teamId)) {
                return result;
            } else {
                return { code: 1, message: "Image link failed" };
            }
        });
    };
}

export const DefaultDockerImageNameCreator: DockerImageNameCreator = async (p, sdmGoal, options, context) => {
    const name = p.name;
    const version = await readSdmVersion(sdmGoal.repo.owner, sdmGoal.repo.name,
        sdmGoal.repo.providerId, sdmGoal.sha, sdmGoal.branch, context);
    return {
        registry: options.registry,
        name,
        version,
    };
};
