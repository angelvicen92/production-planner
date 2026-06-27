import { deepFreeze } from "../immutability";

export enum ORCIntegrationMode {
  Disabled = "disabled",
  Shadow = "shadow",
  Advisory = "advisory",
}

export interface ORCConfiguration {
  readonly integrationMode: ORCIntegrationMode;
}

export const DEFAULT_ORC_CONFIGURATION: ORCConfiguration = deepFreeze({
  integrationMode: ORCIntegrationMode.Shadow,
});

export function normalizeORCConfiguration(configuration: Partial<ORCConfiguration> = {}): Readonly<ORCConfiguration> {
  return deepFreeze({
    ...DEFAULT_ORC_CONFIGURATION,
    ...configuration,
  });
}
