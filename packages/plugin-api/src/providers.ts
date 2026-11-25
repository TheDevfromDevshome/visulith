import type {
  AiProviderContribution,
  LanguageMetadataContribution,
  NodeDefinitionContribution,
  ToolDefinitionContribution,
} from "./manifest.js";

/**
 * Type-level contracts for contribution providers.
 *
 * IMPORTANT: the MVP plugin host does not import, instantiate or call any of
 * these providers. It only reads declarative JSON manifests. These interfaces
 * describe a possible future in-process extension point and are deliberately
 * free of host implementation details.
 */

export interface NodeDefinitionProvider {
  provideNodeDefinitions(): readonly NodeDefinitionContribution[];
}

export interface LanguageMetadataProvider {
  provideLanguageMetadata(): readonly LanguageMetadataContribution[];
}

export interface ToolDefinitionProvider {
  provideToolDefinitions(): readonly ToolDefinitionContribution[];
}

export interface AiProviderDescriptorProvider {
  provideAiProviderDescriptors(): readonly AiProviderContribution[];
}

export interface ContributionProviderBundle
  extends NodeDefinitionProvider,
    LanguageMetadataProvider,
    ToolDefinitionProvider,
    AiProviderDescriptorProvider {}
