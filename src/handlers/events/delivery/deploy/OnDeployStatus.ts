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

import {
    EventFired,
    EventHandler,
    HandleEvent,
    HandlerContext,
    HandlerResult,
    logger,
    Success,
} from "@atomist/automation-client";
import { subscription } from "@atomist/automation-client/graph/graphQL";
import { addressChannelsFor } from "@atomist/sdm/api/context/addressChannels";
import {
    DeploymentListener,
    DeploymentListenerInvocation,
} from "@atomist/sdm/api/listener/DeploymentListener";
import { StagingDeploymentGoal } from "@atomist/sdm/api/machine/wellKnownGoals";
import { CredentialsResolver } from "@atomist/sdm/spi/credentials/CredentialsResolver";
import { RepoRefResolver } from "@atomist/sdm/spi/repo-ref/RepoRefResolver";
import { OnSuccessStatus } from "@atomist/sdm/typings/types";

/**
 * React to a deployment.
 */
@EventHandler("React to a successful deployment",
    subscription({
        name: "OnSuccessStatus",
        variables: {
            context: StagingDeploymentGoal.context,
        },
    }),
)
export class OnDeployStatus implements HandleEvent<OnSuccessStatus.Subscription> {

    constructor(private readonly listeners: DeploymentListener[],
                private readonly repoRefResolver: RepoRefResolver,
                private readonly credentialsFactory: CredentialsResolver) {}

    public async handle(event: EventFired<OnSuccessStatus.Subscription>,
                        context: HandlerContext, params: this): Promise<HandlerResult> {
        const status = event.data.Status[0];
        const commit = status.commit;

        if (status.context !== StagingDeploymentGoal.context) {
            logger.debug(`********* OnDeploy got called with status context=[${status.context}]`);
            return Success;
        }
        const addressChannels = addressChannelsFor(commit.repo, context);
        const id = params.repoRefResolver.toRemoteRepoRef(commit.repo, { sha: commit.sha });
        const credentials = this.credentialsFactory.eventHandlerCredentials(context, id);

        const dil: DeploymentListenerInvocation = {
            context,
            status,
            id,
            addressChannels,
            credentials,
        };
        await Promise.all(params.listeners.map(l => l(dil)));
        return Success;
    }

}
