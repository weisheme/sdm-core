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

import { SoftwareDeliveryMachine } from "@atomist/sdm/api/machine/SoftwareDeliveryMachine";
import { SoftwareDeliveryMachineConfiguration } from "@atomist/sdm/api/machine/SoftwareDeliveryMachineOptions";
import {
    createPendingGitHubStatusOnGoalSet,
    SetGitHubStatusOnGoalCompletion,
} from "./github/gitHubStatusSetters";

export function summarizeGoalsInGitHubStatus(sdm: SoftwareDeliveryMachine<SoftwareDeliveryMachineConfiguration>): SoftwareDeliveryMachine {
    sdm.addGoalsSetListener(createPendingGitHubStatusOnGoalSet(sdm.configuration.sdm.credentialsResolver));
    sdm.addGoalCompletionListener(SetGitHubStatusOnGoalCompletion());
    return sdm;
}
