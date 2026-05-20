import { z } from 'zod';
import type { ZodError } from 'zod';
import type { TEndpointsConfig, TConfig } from './types';
import { EModelEndpoint, eModelEndpointSchema, isAgentsEndpoint } from './schemas';
import { ComponentTypes, SettingTypes, OptionTypes } from './generate';
import { specsConfigSchema, TSpecsConfig } from './models';
import { fileConfigSchema } from './file-config';
import { FileSources } from './types/files';
import { MCPServersSchema } from './mcp';
import { REFILL_INTERVAL_UNITS } from './balance';

export * from './modelCatalog';
export * from './appConstants';

export const defaultSocialLogins = ['google', 'facebook', 'openid', 'github', 'discord', 'saml'];

export const defaultRetrievalModels = [
  'gpt-4o',
  'o1-preview-2024-09-12',
  'o1-preview',
  'o1-mini-2024-09-12',
  'o1-mini',
  'o3-mini',
  'chatgpt-4o-latest',
  'gpt-4o-2024-05-13',
  'gpt-4o-2024-08-06',
  'gpt-4o-mini',
  'gpt-4o-mini-2024-07-18',
  'gpt-4-turbo-preview',
  'gpt-3.5-turbo-0125',
  'gpt-4-0125-preview',
  'gpt-4-1106-preview',
  'gpt-3.5-turbo-1106',
  'gpt-3.5-turbo-0125',
  'gpt-4-turbo',
  'gpt-4-0125',
  'gpt-4-1106',
];

export const excludedKeys = new Set([
  'conversationId',
  'title',
  'iconURL',
  'greeting',
  'endpoint',
  'endpointType',
  'createdAt',
  'updatedAt',
  'expiredAt',
  'messages',
  'isArchived',
  'tags',
  'user',
  '__v',
  '_id',
  'tools',
  'model',
  'files',
  'spec',
  'disableParams',
]);

export enum SettingsViews {
  default = 'default',
  advanced = 'advanced',
}

/** Validates any FileSources value — use for file metadata, DB records, and upload routing. */
export const fileSourceSchema = z.nativeEnum(FileSources);

/**
 * `allowedAddresses` is an SSRF exemption list scoped to private IP space.
 * Validate at config-load time:
 *  - Reject URLs, paths, CIDR ranges, bare host/IP forms, and whitespace.
 *  - Require `host:port` or `[ipv6]:port` entries so an exemption is scoped
 *    to one service port instead of every port on a private host.
 *  - Reject IPv4 literals that fall outside the private/loopback/link-local
 *    ranges. Public IPs are never SSRF targets, so listing one has no
 *    defensive purpose and must not silently grant trust.
 *  - Hostnames pass through; their resolved IP is checked at runtime by
 *    `resolveHostnameSSRF` and only a private resolved IP is meaningful.
 *
 * Mirrors a minimal subset of `isPrivateIP` from `@librechat/api` to avoid a
 * circular package dependency. The runtime helper is the authoritative check;
 * this refinement is a UX guardrail.
 */
function isPrivateIPv4Literal(value: string): boolean {
  const match = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) {
    return false;
  }
  const [a, b, c] = match.slice(1).map(Number) as [number, number, number, number];
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && c === 0) return true; // RFC 5736 IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 198 && (b === 18 || b === 19)) return true;
  if (a >= 224) return true; // multicast/reserved
  return false;
}

function isPrivateIPv6Literal(value: string): boolean {
  if (!value.includes(':')) return false;
  if (value === '::1' || value === '::') return true;
  if (value.startsWith('fc') || value.startsWith('fd')) return true; // fc00::/7
  // fe80::/10 — first hextet 0xfe80–0xfebf
  const firstHextet = value.split(':', 1)[0];
  if (/^[0-9a-f]{1,4}$/.test(firstHextet ?? '')) {
    const hextet = parseInt(firstHextet, 16);
    if ((hextet & 0xffc0) === 0xfe80) return true;
  }
  // 4-in-6: ::ffff:A.B.C.D
  const mappedMatch = value.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedMatch) return isPrivateIPv4Literal(mappedMatch[1]);
  return false;
}

/**
 * Mirrors the allowedAddresses parser in `@librechat/api`'s auth helpers.
 * Kept as a local copy because the data-provider package cannot import from
 * `@librechat/api` without creating a circular dependency. Keep the two
 * implementations in sync.
 */
function normalizePort(port: unknown): string {
  if (typeof port !== 'string' && typeof port !== 'number') return '';
  const portString = String(port).trim();
  if (!/^\d+$/.test(portString)) return '';
  const parsed = Number(portString);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) return '';
  return String(parsed);
}

function parseAllowedAddressEntry(entry: string): { address: string; port: string } | null {
  const trimmed = entry.toLowerCase().trim();
  const bracketedIPv6 = trimmed.match(/^\[([^\]]+)\]:(\d+)$/);
  const hostPort = bracketedIPv6 ? null : trimmed.match(/^([^:]+):(\d+)$/);
  const address = (bracketedIPv6?.[1] ?? hostPort?.[1] ?? '').replace(/^\[|\]$/g, '');
  const port = normalizePort(bracketedIPv6?.[2] ?? hostPort?.[2] ?? '');
  if (!address || !port) return null;
  return { address, port };
}

const allowedAddressEntrySchema = z
  .string()
  .refine((entry) => entry.length > 0 && entry.trim().length > 0, {
    message: 'allowedAddresses entries must be non-empty',
  })
  .refine((entry) => !entry.includes('://') && !entry.includes('/') && !/\s/.test(entry), {
    message:
      'allowedAddresses entries must be host:port pairs — no URLs, paths, CIDR ranges, or whitespace',
  })
  .refine((entry) => parseAllowedAddressEntry(entry) != null, {
    message:
      'allowedAddresses entries must include a port, for example localhost:11434 or [::1]:11434',
  })
  .refine(
    (entry) => {
      const parsed = parseAllowedAddressEntry(entry);
      if (!parsed) return false;
      const stripped = parsed.address;
      const isIPv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(stripped);
      const isIPv6 = !isIPv4 && stripped.includes(':');
      if (!isIPv4 && !isIPv6) {
        return true; // hostname — checked at runtime via DNS
      }
      return isIPv4 ? isPrivateIPv4Literal(stripped) : isPrivateIPv6Literal(stripped);
    },
    {
      message:
        'allowedAddresses is scoped to private IP space — public IP literals are not permitted (use hostname:port if it resolves to a private IP)',
    },
  );

export const allowedAddressesSchema = z.array(allowedAddressEntrySchema).optional();

/** Storage backend strategies only — use for config fields that set where files are stored. */
const FILE_STORAGE_BACKENDS = [
  FileSources.local,
  FileSources.firebase,
  FileSources.s3,
  FileSources.azure_blob,
  FileSources.cloudfront,
] as const satisfies ReadonlyArray<FileSources>;

export const fileStorageSchema = z.enum(FILE_STORAGE_BACKENDS);

export type FileStorage = z.infer<typeof fileStorageSchema>;

export const fileStrategiesSchema = z
  .object({
    default: fileStorageSchema.optional(),
    avatar: fileStorageSchema.optional(),
    image: fileStorageSchema.optional(),
    document: fileStorageSchema.optional(),
    skills: fileStorageSchema.optional(),
  })
  .optional();

const cloudfrontSigningSchema = z.enum(['none', 'cookies', 'url']);

export const cloudfrontConfigSchema = z
  .object({
    domain: z.string().url(),
    distributionId: z.string().optional(),
    invalidateOnDelete: z.boolean().default(false),
    imageSigning: cloudfrontSigningSchema.default('none'),
    urlExpiry: z.number().positive().default(3600),
    cookieExpiry: z.number().positive().max(604800).default(1800),
    cookieDomain: z
      .string()
      .min(1)
      .refine((d) => d.startsWith('.'), {
        message: 'cookieDomain must start with a dot (e.g., ".example.com") to apply to subdomains',
      })
      .optional(),
    storageRegion: z.string().min(1).optional(),
    includeRegionInPath: z.boolean().default(false),
    requireSignedAccess: z.boolean().default(false),
  })
  .refine((data) => !data.invalidateOnDelete || !!data.distributionId, {
    message: 'distributionId is required when invalidateOnDelete is true',
    path: ['distributionId'],
  })
  .refine((data) => data.imageSigning !== 'cookies' || !!data.cookieDomain, {
    message:
      'cookieDomain is required when imageSigning is "cookies" (e.g., ".example.com" for API at api.example.com and CDN at cdn.example.com)',
    path: ['cookieDomain'],
  })
  .refine((data) => !data.requireSignedAccess || data.imageSigning === 'cookies', {
    message:
      'cloudfront.requireSignedAccess=true requires cloudfront.imageSigning="cookies" (signed URL mode is not yet implemented)',
    path: ['requireSignedAccess'],
  })
  .optional();

export type CloudFrontConfig = z.infer<typeof cloudfrontConfigSchema>;

// Helper type to extract the shape of the Zod object schema
type SchemaShape<T> = T extends z.ZodObject<infer U> ? U : never;

// Helper type to determine the default value or undefined based on whether the field has a default
type DefaultValue<T> =
  T extends z.ZodDefault<z.ZodTypeAny> ? ReturnType<T['_def']['defaultValue']> : undefined;

// Extract default values or undefined from the schema shape
type ExtractDefaults<T> = {
  [P in keyof T]: DefaultValue<T[P]>;
};

export type SchemaDefaults<T> = ExtractDefaults<SchemaShape<T>>;

export type TConfigDefaults = SchemaDefaults<typeof configSchema>;

export function getSchemaDefaults<Schema extends z.AnyZodObject>(
  schema: Schema,
): ExtractDefaults<SchemaShape<Schema>> {
  const shape = schema.shape;
  const entries = Object.entries(shape).map(([key, value]) => {
    if (value instanceof z.ZodDefault) {
      // Extract default value if it exists
      return [key, value._def.defaultValue()];
    }
    return [key, undefined];
  });

  // Create the object with the right types
  return Object.fromEntries(entries) as ExtractDefaults<SchemaShape<Schema>>;
}

export const modelConfigSchema = z
  .object({
    deploymentName: z.string().optional(),
    version: z.string().optional(),
  })
  .or(z.boolean());

export type TAzureModelConfig = z.infer<typeof modelConfigSchema>;

const paramValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(paramValueSchema),
    z.record(z.string(), paramValueSchema),
  ]),
);

/** Validates addParams while keeping web_search aligned with current runtime boolean handling. */
const addParamsSchema: z.ZodType<Record<string, unknown>> = z
  .record(z.string(), paramValueSchema)
  .superRefine((params, ctx) => {
    if (params.web_search === undefined || typeof params.web_search === 'boolean') {
      return;
    }

    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['web_search'],
      message: '`web_search` must be a boolean in addParams',
    });
  });

export const azureBaseSchema = z.object({
  apiKey: z.string(),
  serverless: z.boolean().optional(),
  instanceName: z.string().optional(),
  deploymentName: z.string().optional(),
  addParams: addParamsSchema.optional(),
  dropParams: z.array(z.string()).optional(),
  version: z.string().optional(),
  baseURL: z.string().optional(),
  additionalHeaders: z.record(z.string()).optional(),
});

export type TAzureBaseSchema = z.infer<typeof azureBaseSchema>;

export const azureGroupSchema = z
  .object({
    group: z.string(),
    models: z.record(z.string(), modelConfigSchema),
  })
  .required()
  .and(azureBaseSchema);

export const azureGroupConfigsSchema = z.array(azureGroupSchema).min(1);
export type TAzureGroup = z.infer<typeof azureGroupSchema>;
export type TAzureGroups = z.infer<typeof azureGroupConfigsSchema>;
export type TAzureModelMapSchema = {
  // deploymentName?: string;
  // version?: string;
  group: string;
};

export type TAzureModelGroupMap = Record<string, TAzureModelMapSchema | undefined>;
export type TAzureGroupMap = Record<
  string,
  (TAzureBaseSchema & { models: Record<string, TAzureModelConfig | undefined> }) | undefined
>;

export type TValidatedAzureConfig = {
  modelNames: string[];
  groupMap: TAzureGroupMap;
  assistantModels?: string[];
  assistantGroups?: string[];
  modelGroupMap: TAzureModelGroupMap;
};

export type TAzureConfigValidationResult = TValidatedAzureConfig & {
  isValid: boolean;
  errors: (ZodError | string)[];
};

export enum Capabilities {
  code_interpreter = 'code_interpreter',
  image_vision = 'image_vision',
  retrieval = 'retrieval',
  actions = 'actions',
  tools = 'tools',
}

export enum AgentCapabilities {
  hide_sequential_outputs = 'hide_sequential_outputs',
  programmatic_tools = 'programmatic_tools',
  end_after_tools = 'end_after_tools',
  deferred_tools = 'deferred_tools',
  execute_code = 'execute_code',
  file_search = 'file_search',
  web_search = 'web_search',
  artifacts = 'artifacts',
  subagents = 'subagents',
  actions = 'actions',
  context = 'context',
  skills = 'skills',
  tools = 'tools',
  chain = 'chain',
  ocr = 'ocr',
}

export const baseEndpointSchema = z.object({
  streamRate: z.number().optional(),
  baseURL: z.string().optional(),
  titlePrompt: z.string().optional(),
  titleModel: z.string().optional(),
  titleConvo: z.boolean().optional(),
  titleMethod: z
    .union([z.literal('completion'), z.literal('functions'), z.literal('structured')])
    .optional(),
  titleEndpoint: z.string().optional(),
  titlePromptTemplate: z.string().optional(),
  /** Maximum characters allowed in a single tool result before truncation. */
  maxToolResultChars: z.number().positive().optional(),
});

export type TBaseEndpoint = z.infer<typeof baseEndpointSchema>;

export const bedrockEndpointSchema = baseEndpointSchema.merge(
  z.object({
    availableRegions: z.array(z.string()).optional(),
    models: z.array(z.string()).optional(),
    inferenceProfiles: z.record(z.string(), z.string()).optional(),
  }),
);

const modelItemSchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    description: z.string().optional(),
  }),
]);

export const defaultAgentCapabilities = [
  // Commented as requires latest Code Interpreter API
  // AgentCapabilities.programmatic_tools,
  AgentCapabilities.deferred_tools,
  AgentCapabilities.execute_code,
  AgentCapabilities.file_search,
  AgentCapabilities.web_search,
  AgentCapabilities.artifacts,
  AgentCapabilities.subagents,
  AgentCapabilities.actions,
  AgentCapabilities.context,
  AgentCapabilities.skills,
  AgentCapabilities.tools,
  AgentCapabilities.chain,
  AgentCapabilities.ocr,
];

const LOCAL_REMOTE_OIDC_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

export function isRemoteOidcUrlAllowed(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    if (url.protocol !== 'http:') return false;

    const hostname = url.hostname.toLowerCase();
    return LOCAL_REMOTE_OIDC_HOSTS.has(hostname) || hostname.endsWith('.localhost');
  } catch {
    return false;
  }
}

const remoteApiOidcUrlSchema = z
  .string()
  .url()
  .refine(isRemoteOidcUrlAllowed, { message: 'must use https:// unless targeting localhost' });

const remoteApiOidcScopeSchema = z.string().refine((scope) => !scope.includes(','), {
  message: 'scopes must be space-separated',
});

const remoteApiOidcSchema = z
  .object({
    enabled: z.boolean().default(false),
    issuer: remoteApiOidcUrlSchema.optional(),
    audience: z.string().min(1).optional(),
    jwksUri: remoteApiOidcUrlSchema.optional(),
    scope: remoteApiOidcScopeSchema.optional(),
  })
  .superRefine((oidc, ctx) => {
    if (oidc.enabled === true && !oidc.issuer) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['issuer'],
        message: 'issuer is required when OIDC auth is enabled',
      });
    }
    if (oidc.enabled === true && !oidc.audience) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['audience'],
        message: 'audience is required when OIDC auth is enabled',
      });
    }
  });

const remoteApiAuthSchema = z.object({
  apiKey: z
    .object({
      enabled: z.boolean().default(true),
    })
    .optional(),
  oidc: remoteApiOidcSchema.optional(),
});

const remoteApiSchema = z.object({
  auth: remoteApiAuthSchema.optional(),
});

export const agentsEndpointSchema = baseEndpointSchema
  .omit({ baseURL: true })
  .merge(
    z.object({
      /* agents specific */
      recursionLimit: z.number().optional(),
      disableBuilder: z.boolean().optional().default(false),
      maxRecursionLimit: z.number().optional(),
      maxCitations: z.number().min(1).max(50).optional().default(30),
      maxCitationsPerFile: z.number().min(1).max(10).optional().default(7),
      minRelevanceScore: z.number().min(0.0).max(1.0).optional().default(0.45),
      allowedProviders: z.array(z.union([z.string(), eModelEndpointSchema])).optional(),
      capabilities: z
        .array(z.nativeEnum(AgentCapabilities))
        .optional()
        .default(defaultAgentCapabilities),
      remoteApi: remoteApiSchema.optional(),
    }),
  )
  .default({
    disableBuilder: false,
    capabilities: defaultAgentCapabilities,
    maxCitations: 30,
    maxCitationsPerFile: 7,
    minRelevanceScore: 0.45,
  });

export type TAgentsEndpoint = z.infer<typeof agentsEndpointSchema>;

export const paramDefinitionSchema = z.object({
  key: z.string(),
  description: z.string().optional(),
  type: z.nativeEnum(SettingTypes).optional(),
  default: z.union([z.number(), z.boolean(), z.string(), z.array(z.string())]).optional(),
  showLabel: z.boolean().optional(),
  showDefault: z.boolean().optional(),
  options: z.array(z.string()).optional(),
  range: z
    .object({
      min: z.number(),
      max: z.number(),
      step: z.number().optional(),
    })
    .optional(),
  enumMappings: z.record(z.union([z.number(), z.boolean(), z.string()])).optional(),
  component: z.nativeEnum(ComponentTypes).optional(),
  optionType: z.nativeEnum(OptionTypes).optional(),
  columnSpan: z.number().int().nonnegative().optional(),
  columns: z.number().int().min(1).max(4).optional(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  labelCode: z.boolean().optional(),
  placeholderCode: z.boolean().optional(),
  descriptionCode: z.boolean().optional(),
  minText: z.number().optional(),
  maxText: z.number().optional(),
  minTags: z.number().min(0).optional(),
  maxTags: z.number().min(0).optional(),
  includeInput: z.boolean().optional(),
  descriptionSide: z.enum(['top', 'right', 'bottom', 'left']).optional(),
  searchPlaceholder: z.string().optional(),
  selectPlaceholder: z.string().optional(),
  searchPlaceholderCode: z.boolean().optional(),
  selectPlaceholderCode: z.boolean().optional(),
});

export const endpointSchema = baseEndpointSchema.merge(
  z.object({
    name: z.string().refine((value) => !eModelEndpointSchema.safeParse(value).success, {
      message: `Value cannot be one of the default endpoint (EModelEndpoint) values: ${Object.values(
        EModelEndpoint,
      ).join(', ')}`,
    }),
    apiKey: z.string(),
    baseURL: z.string(),
    models: z.object({
      default: z.array(modelItemSchema).min(1),
      fetch: z.boolean().optional(),
      userIdQuery: z.boolean().optional(),
    }),
    iconURL: z.string().optional(),
    modelDisplayLabel: z.string().optional(),
    headers: z.record(z.string()).optional(),
    addParams: addParamsSchema.optional(),
    dropParams: z.array(z.string()).optional(),
    customParams: z
      .object({
        defaultParamsEndpoint: z.string().default('custom'),
        paramDefinitions: z.array(paramDefinitionSchema).optional(),
      })
      .strict()
      .optional(),
    directEndpoint: z.boolean().optional(),
    titleMessageRole: z.enum(['system', 'user', 'assistant']).optional(),
  }),
);

export type TEndpoint = z.infer<typeof endpointSchema>;

export const azureEndpointSchema = z
  .object({
    groups: azureGroupConfigsSchema,
  })
  .and(
    endpointSchema
      .pick({
        streamRate: true,
        titleConvo: true,
        titleMethod: true,
        titleModel: true,
        titlePrompt: true,
        titlePromptTemplate: true,
      })
      .partial(),
  );

export type TAzureConfig = Omit<z.infer<typeof azureEndpointSchema>, 'groups'> &
  TAzureConfigValidationResult;

/**
 * Vertex AI model configuration - similar to Azure model config
 * Allows specifying deployment name for each model
 */
export const vertexModelConfigSchema = z
  .object({
    /** The actual model ID/deployment name used by Vertex AI API */
    deploymentName: z.string().optional(),
  })
  .or(z.boolean());

export type TVertexModelConfig = z.infer<typeof vertexModelConfigSchema>;

/**
 * Vertex AI configuration schema for Anthropic models served via Google Cloud Vertex AI.
 * Similar to Azure configuration, this allows running Anthropic models through Google Cloud.
 */
export const vertexAISchema = z.object({
  /** Enable Vertex AI mode for Anthropic (defaults to true when vertex config is present) */
  enabled: z.boolean().optional(),
  /** Google Cloud Project ID (optional - auto-detected from service key file if not provided) */
  projectId: z.string().optional(),
  /** Vertex AI region (e.g., 'us-east5', 'europe-west1') */
  region: z.string().default('us-east5'),
  /** Optional: Path to service account key file */
  serviceKeyFile: z.string().optional(),
  /** Optional: Default deployment name for all models (can be overridden per model) */
  deploymentName: z.string().optional(),
  /** Optional: Available models - can be string array or object with deploymentName mapping */
  models: z.union([z.array(z.string()), z.record(z.string(), vertexModelConfigSchema)]).optional(),
});

export type TVertexAISchema = z.infer<typeof vertexAISchema>;

export type TVertexModelMap = Record<string, string>;

/**
 * Validated Vertex AI configuration result
 */
export type TVertexAIConfig = TVertexAISchema & {
  isValid: boolean;
  errors: string[];
  modelNames?: string[];
  modelDeploymentMap?: TVertexModelMap;
};

/**
 * Anthropic endpoint schema with optional Vertex AI configuration.
 * Extends baseEndpointSchema with Vertex AI support.
 */
export const anthropicEndpointSchema = baseEndpointSchema.merge(
  z.object({
    /** Vertex AI configuration for running Anthropic models on Google Cloud */
    vertex: vertexAISchema.optional(),
    /** Optional: List of available models */
    models: z.array(z.string()).optional(),
  }),
);

export type TAnthropicEndpoint = z.infer<typeof anthropicEndpointSchema>;

const ttsOpenaiSchema = z.object({
  url: z.string().optional(),
  apiKey: z.string(),
  model: z.string(),
  voices: z.array(z.string()),
});

const ttsAzureOpenAISchema = z.object({
  instanceName: z.string(),
  apiKey: z.string(),
  deploymentName: z.string(),
  apiVersion: z.string(),
  model: z.string(),
  voices: z.array(z.string()),
});

const ttsElevenLabsSchema = z.object({
  url: z.string().optional(),
  websocketUrl: z.string().optional(),
  apiKey: z.string(),
  model: z.string(),
  voices: z.array(z.string()),
  voice_settings: z
    .object({
      similarity_boost: z.number().optional(),
      stability: z.number().optional(),
      style: z.number().optional(),
      use_speaker_boost: z.boolean().optional(),
    })
    .optional(),
  pronunciation_dictionary_locators: z.array(z.string()).optional(),
});

const ttsLocalaiSchema = z.object({
  url: z.string(),
  apiKey: z.string().optional(),
  voices: z.array(z.string()),
  backend: z.string(),
});

const ttsSchema = z.object({
  openai: ttsOpenaiSchema.optional(),
  azureOpenAI: ttsAzureOpenAISchema.optional(),
  elevenlabs: ttsElevenLabsSchema.optional(),
  localai: ttsLocalaiSchema.optional(),
});

const sttOpenaiSchema = z.object({
  url: z.string().optional(),
  apiKey: z.string(),
  model: z.string(),
});

const sttAzureOpenAISchema = z.object({
  instanceName: z.string(),
  apiKey: z.string(),
  deploymentName: z.string(),
  apiVersion: z.string(),
});

const sttSchema = z.object({
  openai: sttOpenaiSchema.optional(),
  azureOpenAI: sttAzureOpenAISchema.optional(),
});

const speechTab = z
  .object({
    conversationMode: z.boolean().optional(),
    advancedMode: z.boolean().optional(),
    speechToText: z
      .boolean()
      .optional()
      .or(
        z.object({
          /** Keep in sync with STTProviders enum (defined below — cannot reference due to eval order) */
          engineSTT: z.enum(['openai', 'azureOpenAI']).optional(),
          languageSTT: z.string().optional(),
          autoTranscribeAudio: z.boolean().optional(),
          decibelValue: z.number().optional(),
          autoSendText: z.number().optional(),
        }),
      )
      .optional(),
    textToSpeech: z
      .boolean()
      .optional()
      .or(
        z.object({
          /** Keep in sync with TTSProviders enum (defined below — cannot reference due to eval order) */
          engineTTS: z.enum(['openai', 'azureOpenAI', 'elevenlabs', 'localai']).optional(),
          voice: z.string().optional(),
          languageTTS: z.string().optional(),
          automaticPlayback: z.boolean().optional(),
          playbackRate: z.number().min(0.25).max(4).optional(),
          cacheTTS: z.boolean().optional(),
        }),
      )
      .optional(),
  })
  .optional();

export enum RateLimitPrefix {
  FILE_UPLOAD = 'FILE_UPLOAD',
  IMPORT = 'IMPORT',
  TTS = 'TTS',
  STT = 'STT',
}

export const rateLimitSchema = z.object({
  fileUploads: z
    .object({
      ipMax: z.number().optional(),
      ipWindowInMinutes: z.number().optional(),
      userMax: z.number().optional(),
      userWindowInMinutes: z.number().optional(),
    })
    .optional(),
  conversationsImport: z
    .object({
      ipMax: z.number().optional(),
      ipWindowInMinutes: z.number().optional(),
      userMax: z.number().optional(),
      userWindowInMinutes: z.number().optional(),
    })
    .optional(),
  tts: z
    .object({
      ipMax: z.number().optional(),
      ipWindowInMinutes: z.number().optional(),
      userMax: z.number().optional(),
      userWindowInMinutes: z.number().optional(),
    })
    .optional(),
  stt: z
    .object({
      ipMax: z.number().optional(),
      ipWindowInMinutes: z.number().optional(),
      userMax: z.number().optional(),
      userWindowInMinutes: z.number().optional(),
    })
    .optional(),
});

export enum EImageOutputType {
  PNG = 'png',
  WEBP = 'webp',
  JPEG = 'jpeg',
}

const termsOfServiceSchema = z.object({
  externalUrl: z.string().optional(),
  openNewTab: z.boolean().optional(),
  modalAcceptance: z.boolean().optional(),
  modalTitle: z.string().optional(),
  modalContent: z.string().or(z.array(z.string())).optional(),
});

export type TTermsOfService = z.infer<typeof termsOfServiceSchema>;

// Schema for localized string (either simple string or language-keyed object)
const localizedStringSchema = z.union([z.string(), z.record(z.string())]);
export type LocalizedString = z.infer<typeof localizedStringSchema>;

const mcpServersSchema = z
  .object({
    placeholder: z.string().optional(),
    use: z.boolean().optional(),
    create: z.boolean().optional(),
    share: z.boolean().optional(),
    public: z.boolean().optional(),
    trustCheckbox: z
      .object({
        label: localizedStringSchema.optional(),
        subLabel: localizedStringSchema.optional(),
      })
      .optional(),
  })
  .optional();

export type TMcpServersConfig = z.infer<typeof mcpServersSchema>;

export const interfaceSchema = z
  .object({
    privacyPolicy: z
      .object({
        externalUrl: z.string().optional(),
        openNewTab: z.boolean().optional(),
      })
      .optional(),
    termsOfService: termsOfServiceSchema.optional(),
    customWelcome: z.string().optional(),
    mcpServers: mcpServersSchema.optional(),
    modelSelect: z.boolean().optional(),
    parameters: z.boolean().optional(),
    multiConvo: z.boolean().optional(),
    bookmarks: z.boolean().optional(),
    memories: z.boolean().optional(),
    presets: z.boolean().optional(),
    prompts: z
      .union([
        z.boolean(),
        z.object({
          use: z.boolean().optional(),
          create: z.boolean().optional(),
          share: z.boolean().optional(),
          public: z.boolean().optional(),
        }),
      ])
      .optional(),
    agents: z
      .union([
        z.boolean(),
        z.object({
          use: z.boolean().optional(),
          create: z.boolean().optional(),
          share: z.boolean().optional(),
          public: z.boolean().optional(),
        }),
      ])
      .optional(),
    temporaryChat: z.boolean().optional(),
    temporaryChatRetention: z.number().min(1).max(8760).optional(),
    autoSubmitFromUrl: z.boolean().optional(),
    runCode: z.boolean().optional(),
    webSearch: z.boolean().optional(),
    peoplePicker: z
      .object({
        users: z.boolean().optional(),
        groups: z.boolean().optional(),
        roles: z.boolean().optional(),
      })
      .optional(),
    marketplace: z
      .object({
        use: z.boolean().optional(),
      })
      .optional(),
    fileSearch: z.boolean().optional(),
    fileCitations: z.boolean().optional(),
    remoteAgents: z
      .object({
        use: z.boolean().optional(),
        create: z.boolean().optional(),
        share: z.boolean().optional(),
        public: z.boolean().optional(),
      })
      .optional(),
    skills: z
      .union([
        z.boolean(),
        z.object({
          use: z.boolean().optional(),
          create: z.boolean().optional(),
          share: z.boolean().optional(),
          public: z.boolean().optional(),
          defaultActiveOnShare: z.boolean().optional(),
        }),
      ])
      .optional(),
  })
  .default({
    modelSelect: true,
    parameters: true,
    presets: true,
    multiConvo: true,
    bookmarks: true,
    memories: true,
    prompts: {
      use: true,
      create: true,
      share: false,
      public: false,
    },
    agents: {
      use: true,
      create: true,
      share: false,
      public: false,
    },
    temporaryChat: true,
    autoSubmitFromUrl: true,
    runCode: true,
    webSearch: true,
    peoplePicker: {
      users: true,
      groups: true,
      roles: true,
    },
    marketplace: {
      use: false,
    },
    mcpServers: {
      use: true,
      create: true,
      share: false,
      public: false,
    },
    fileSearch: true,
    fileCitations: true,
    remoteAgents: {
      use: false,
      create: false,
      share: false,
      public: false,
    },
    skills: {
      use: true,
      create: true,
      share: false,
      public: false,
      defaultActiveOnShare: false,
    },
  });

export type TInterfaceConfig = z.infer<typeof interfaceSchema>;
export type TBalanceConfig = z.infer<typeof balanceSchema>;
export type TTransactionsConfig = z.infer<typeof transactionsSchema>;

export const turnstileOptionsSchema = z
  .object({
    language: z.string().default('auto'),
    size: z.enum(['normal', 'compact', 'flexible', 'invisible']).default('normal'),
  })
  .default({
    language: 'auto',
    size: 'normal',
  });

export const turnstileSchema = z.object({
  siteKey: z.string(),
  options: turnstileOptionsSchema.optional(),
});

export type TTurnstileConfig = z.infer<typeof turnstileSchema>;

export type TStartupConfig = {
  appTitle: string;
  socialLogins?: string[];
  interface?: TInterfaceConfig;
  turnstile?: TTurnstileConfig;
  balance?: TBalanceConfig;
  transactions?: TTransactionsConfig;
  discordLoginEnabled: boolean;
  facebookLoginEnabled: boolean;
  githubLoginEnabled: boolean;
  googleLoginEnabled: boolean;
  openidLoginEnabled: boolean;
  appleLoginEnabled: boolean;
  samlLoginEnabled: boolean;
  openidLabel: string;
  openidImageUrl: string;
  openidAutoRedirect: boolean;
  samlLabel: string;
  samlImageUrl: string;
  /** LDAP Auth Configuration */
  ldap?: {
    /** LDAP enabled */
    enabled: boolean;
    /** Whether LDAP uses username vs. email */
    username?: boolean;
  };
  serverDomain: string;
  emailLoginEnabled: boolean;
  registrationEnabled: boolean;
  socialLoginEnabled: boolean;
  passwordResetEnabled: boolean;
  emailEnabled: boolean;
  showBirthdayIcon: boolean;
  helpAndFaqURL: string;
  customFooter?: string;
  modelSpecs?: TSpecsConfig;
  modelDescriptions?: Record<string, Record<string, string>>;
  sharedLinksEnabled: boolean;
  publicSharedLinksEnabled: boolean;
  analyticsGtmId?: string;
  bundlerURL?: string;
  staticBundlerURL?: string;
  sharePointFilePickerEnabled?: boolean;
  sharePointBaseUrl?: string;
  sharePointPickerGraphScope?: string;
  sharePointPickerSharePointScope?: string;
  openidReuseTokens?: boolean;
  allowAccountDeletion: boolean;
  minPasswordLength?: number;
  webSearch?: {
    searchProvider?: SearchProviders;
    scraperProvider?: ScraperProviders;
    rerankerType?: RerankerTypes;
  };
  cloudFront?: {
    cookieRefresh?: {
      endpoint: string;
      domain: string;
    };
  };
  mcpServers?: Record<
    string,
    {
      customUserVars: Record<
        string,
        {
          title: string;
          description: string;
        }
      >;
      chatMenu?: boolean;
      isOAuth?: boolean;
      startup?: boolean;
      iconPath?: string;
    }
  >;
  mcpPlaceholder?: string;
  conversationImportMaxFileSize?: number;
};

export enum OCRStrategy {
  MISTRAL_OCR = 'mistral_ocr',
  CUSTOM_OCR = 'custom_ocr',
  AZURE_MISTRAL_OCR = 'azure_mistral_ocr',
  VERTEXAI_MISTRAL_OCR = 'vertexai_mistral_ocr',
  DOCUMENT_PARSER = 'document_parser',
}

export enum SearchCategories {
  PROVIDERS = 'providers',
  SCRAPERS = 'scrapers',
  RERANKERS = 'rerankers',
}

export enum SearchProviders {
  SERPER = 'serper',
  SEARXNG = 'searxng',
  TAVILY = 'tavily',
}

export enum ScraperProviders {
  FIRECRAWL = 'firecrawl',
  SERPER = 'serper',
  TAVILY = 'tavily',
}

export enum RerankerTypes {
  JINA = 'jina',
  COHERE = 'cohere',
  NONE = 'none',
}

export enum SafeSearchTypes {
  OFF = 0,
  MODERATE = 1,
  STRICT = 2,
}

export const webSearchSchema = z.object({
  serperApiKey: z.string().optional().default('${SERPER_API_KEY}'),
  searxngInstanceUrl: z.string().optional().default('${SEARXNG_INSTANCE_URL}'),
  searxngApiKey: z.string().optional().default('${SEARXNG_API_KEY}'),
  firecrawlApiKey: z.string().optional().default('${FIRECRAWL_API_KEY}'),
  firecrawlApiUrl: z.string().optional().default('${FIRECRAWL_API_URL}'),
  firecrawlVersion: z.string().optional().default('${FIRECRAWL_VERSION}'),
  tavilyApiKey: z.string().optional().default('${TAVILY_API_KEY}'),
  tavilySearchUrl: z.string().optional().default('${TAVILY_SEARCH_URL}'),
  tavilyExtractUrl: z.string().optional().default('${TAVILY_EXTRACT_URL}'),
  jinaApiKey: z.string().optional().default('${JINA_API_KEY}'),
  jinaApiUrl: z.string().optional().default('${JINA_API_URL}'),
  cohereApiKey: z.string().optional().default('${COHERE_API_KEY}'),
  searchProvider: z.nativeEnum(SearchProviders).optional(),
  scraperProvider: z.nativeEnum(ScraperProviders).optional(),
  rerankerType: z.nativeEnum(RerankerTypes).optional(),
  scraperTimeout: z.number().int().nonnegative().optional(),
  safeSearch: z.nativeEnum(SafeSearchTypes).default(SafeSearchTypes.MODERATE),
  firecrawlOptions: z
    .object({
      formats: z.array(z.string()).optional(),
      includeTags: z.array(z.string()).optional(),
      excludeTags: z.array(z.string()).optional(),
      headers: z.record(z.string()).optional(),
      waitFor: z.number().optional(),
      timeout: z.number().int().nonnegative().optional(),
      maxAge: z.number().optional(),
      mobile: z.boolean().optional(),
      skipTlsVerification: z.boolean().optional(),
      blockAds: z.boolean().optional(),
      removeBase64Images: z.boolean().optional(),
      parsePDF: z.boolean().optional(),
      storeInCache: z.boolean().optional(),
      zeroDataRetention: z.boolean().optional(),
      location: z
        .object({
          country: z.string().optional(),
          languages: z.array(z.string()).optional(),
        })
        .optional(),
      onlyMainContent: z.boolean().optional(),
      changeTrackingOptions: z
        .object({
          modes: z.array(z.string()).optional(),
          schema: z.record(z.unknown()).optional(),
          prompt: z.string().optional(),
          tag: z.string().nullable().optional(),
        })
        .optional(),
    })
    .optional(),
  tavilySearchOptions: z
    .object({
      searchDepth: z.enum(['basic', 'advanced', 'fast', 'ultra-fast']).optional(),
      maxResults: z.number().int().min(1).max(20).optional(),
      includeImages: z.boolean().optional(),
      includeAnswer: z.union([z.boolean(), z.enum(['basic', 'advanced'])]).optional(),
      includeRawContent: z.union([z.boolean(), z.enum(['markdown', 'text'])]).optional(),
      includeDomains: z.array(z.string()).optional(),
      excludeDomains: z.array(z.string()).optional(),
      topic: z.enum(['general', 'news', 'finance']).optional(),
      timeRange: z.enum(['day', 'week', 'month', 'year', 'd', 'w', 'm', 'y']).optional(),
      includeImageDescriptions: z.boolean().optional(),
      includeFavicon: z.boolean().optional(),
      chunksPerSource: z.number().int().min(1).max(3).optional(),
      safeSearch: z.boolean().optional(),
      timeout: z.number().int().nonnegative().max(120000).optional(),
    })
    .optional(),
  tavilyScraperOptions: z
    .object({
      extractDepth: z.enum(['basic', 'advanced']).optional(),
      includeImages: z.boolean().optional(),
      includeFavicon: z.boolean().optional(),
      format: z.enum(['markdown', 'text']).optional(),
      timeout: z.number().int().nonnegative().max(120000).optional(),
    })
    .optional(),
});

export type TWebSearchConfig = DeepPartial<z.infer<typeof webSearchSchema>>;

export const ocrSchema = z.object({
  mistralModel: z.string().optional(),
  apiKey: z.string().optional().default('${OCR_API_KEY}'),
  baseURL: z.string().optional().default('${OCR_BASEURL}'),
  strategy: z.nativeEnum(OCRStrategy).default(OCRStrategy.MISTRAL_OCR),
});

export const balanceSchema = z.object({
  enabled: z.boolean().optional().default(false),
  startBalance: z.number().optional().default(20000),
  autoRefillEnabled: z.boolean().optional().default(false),
  refillIntervalValue: z.number().optional().default(30),
  refillIntervalUnit: z.enum(REFILL_INTERVAL_UNITS).optional().default('days'),
  refillAmount: z.number().optional().default(10000),
});

export const transactionsSchema = z.object({
  enabled: z.boolean().optional().default(true),
});

export const memorySchema = z.object({
  disabled: z.boolean().optional(),
  validKeys: z.array(z.string()).optional(),
  tokenLimit: z.number().optional(),
  charLimit: z.number().optional().default(10000),
  personalize: z.boolean().default(true),
  messageWindowSize: z.number().optional().default(5),
  agent: z
    .union([
      z.object({
        enabled: z.boolean().optional(),
        id: z.string(),
      }),
      z.object({
        enabled: z.boolean().optional(),
        provider: z.string(),
        model: z.string(),
        instructions: z.string().optional(),
        model_parameters: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
      }),
    ])
    .optional(),
});

export type TMemoryConfig = DeepPartial<z.infer<typeof memorySchema>>;

export const summarizationTriggerSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('token_ratio'),
    value: z.number().finite().min(0).max(1),
  }),
  z.object({
    type: z.literal('remaining_tokens'),
    value: z.number().finite().int().positive(),
  }),
  z.object({
    type: z.literal('messages_to_refine'),
    value: z.number().finite().int().positive(),
  }),
]);

export const contextPruningSchema = z.object({
  enabled: z.boolean().optional(),
  keepLastAssistants: z.number().min(0).max(10).optional(),
  softTrimRatio: z.number().min(0).max(1).optional(),
  hardClearRatio: z.number().min(0).max(1).optional(),
  minPrunableToolChars: z.number().min(0).optional(),
});

export const summarizationConfigSchema = z.object({
  enabled: z.boolean().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  parameters: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  trigger: summarizationTriggerSchema.optional(),
  prompt: z.string().optional(),
  updatePrompt: z.string().optional(),
  reserveRatio: z.number().min(0).max(1).optional(),
  maxSummaryTokens: z.number().positive().optional(),
  contextPruning: contextPruningSchema.optional(),
});

export type SummarizationConfig = z.infer<typeof summarizationConfigSchema>;

const customEndpointsSchema = z.array(endpointSchema.partial()).optional();

export const configSchema = z.object({
  version: z.string(),
  cache: z.boolean().default(true),
  ocr: ocrSchema.optional(),
  webSearch: webSearchSchema.optional(),
  memory: memorySchema.optional(),
  summarization: summarizationConfigSchema.optional(),
  secureImageLinks: z.boolean().optional(),
  imageOutputType: z.nativeEnum(EImageOutputType).default(EImageOutputType.PNG),
  includedTools: z.array(z.string()).optional(),
  filteredTools: z.array(z.string()).optional(),
  mcpServers: MCPServersSchema.optional(),
  mcpSettings: z
    .object({
      allowedDomains: z.array(z.string()).optional(),
      allowedAddresses: allowedAddressesSchema,
    })
    .optional(),
  interface: interfaceSchema,
  turnstile: turnstileSchema.optional(),
  fileStrategy: fileStorageSchema.default(FileSources.local),
  fileStrategies: fileStrategiesSchema,
  cloudfront: cloudfrontConfigSchema,
  actions: z
    .object({
      allowedDomains: z.array(z.string()).optional(),
      allowedAddresses: allowedAddressesSchema,
    })
    .optional(),
  registration: z
    .object({
      socialLogins: z.array(z.string()).optional(),
      allowedDomains: z.array(z.string()).optional(),
    })
    .default({ socialLogins: defaultSocialLogins }),
  balance: balanceSchema.optional(),
  transactions: transactionsSchema.optional(),
  speech: z
    .object({
      tts: ttsSchema.optional(),
      stt: sttSchema.optional(),
      speechTab: speechTab.optional(),
    })
    .optional(),
  rateLimits: rateLimitSchema.optional(),
  fileConfig: fileConfigSchema.optional(),
  modelSpecs: specsConfigSchema.optional(),
  endpoints: z
    .object({
      allowedAddresses: allowedAddressesSchema,
      all: baseEndpointSchema.omit({ baseURL: true }).optional(),
      [EModelEndpoint.openAI]: baseEndpointSchema.optional(),
      [EModelEndpoint.google]: baseEndpointSchema.optional(),
      [EModelEndpoint.anthropic]: anthropicEndpointSchema.optional(),
      [EModelEndpoint.azureOpenAI]: azureEndpointSchema.optional(),
      [EModelEndpoint.agents]: agentsEndpointSchema.optional(),
      [EModelEndpoint.custom]: customEndpointsSchema.optional(),
      [EModelEndpoint.bedrock]: bedrockEndpointSchema.optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one `endpoints` field must be provided.',
    })
    .optional(),
});

/**
 * Recursively makes all properties of T optional, including nested objects.
 * Handles arrays, primitives, functions, and Date objects correctly.
 */
export type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepPartial<U>>
    : // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
      T extends Function
      ? T
      : T extends Date
        ? T
        : T extends object
          ? {
              [P in keyof T]?: DeepPartial<T[P]>;
            }
          : T;

export const getConfigDefaults = () => getSchemaDefaults(configSchema);
export type TCustomConfig = DeepPartial<z.infer<typeof configSchema>>;
export type TCustomEndpoints = z.infer<typeof customEndpointsSchema>;

export type TProviderSchema =
  | z.infer<typeof ttsOpenaiSchema>
  | z.infer<typeof ttsElevenLabsSchema>
  | z.infer<typeof ttsLocalaiSchema>
  | undefined;

/**
 * Retrieves a specific field from the endpoints configuration for a given endpoint key.
 * Does not infer or default any endpoint type when absent.
 */
export function getEndpointField<
  K extends TConfig[keyof TConfig] extends never ? never : keyof TConfig,
>(
  endpointsConfig: TEndpointsConfig | undefined | null,
  endpoint: EModelEndpoint | string | null | undefined,
  property: K,
): TConfig[K] | undefined {
  if (!endpointsConfig || endpoint === null || endpoint === undefined) {
    return undefined;
  }
  const config = endpointsConfig[endpoint];
  if (!config) {
    return undefined;
  }
  return config[property];
}

/**
 * Resolves the effective endpoint type:
 * - Non-agents endpoint: config.type || endpoint
 * - Agents + provider: config[provider].type || provider
 * - Agents, no provider: EModelEndpoint.agents
 *
 * Returns `undefined` when endpoint is null/undefined.
 */
export function resolveEndpointType(
  endpointsConfig: TEndpointsConfig | undefined | null,
  endpoint: string | null | undefined,
  agentProvider?: string | null,
): EModelEndpoint | string | undefined {
  if (!endpoint) {
    return undefined;
  }

  if (!isAgentsEndpoint(endpoint)) {
    return getEndpointField(endpointsConfig, endpoint, 'type') || endpoint;
  }

  if (agentProvider) {
    const providerType = getEndpointField(endpointsConfig, agentProvider, 'type');
    if (providerType) {
      return providerType;
    }
    return agentProvider;
  }

  return EModelEndpoint.agents;
}

/** Resolves the `defaultParamsEndpoint` for a given endpoint from its custom params config */
export function getDefaultParamsEndpoint(
  endpointsConfig: TEndpointsConfig | undefined | null,
  endpoint: string | null | undefined,
): string | undefined {
  if (!endpointsConfig || !endpoint) {
    return undefined;
  }
  return endpointsConfig[endpoint]?.customParams?.defaultParamsEndpoint;
}
