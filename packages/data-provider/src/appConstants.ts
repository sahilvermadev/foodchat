import { EModelEndpoint } from './schemas';

export enum InfiniteCollections {
  PROMPT_GROUPS = 'promptGroups',
  SHARED_LINKS = 'sharedLinks',
}

export enum Time {
  ONE_DAY = 86400000,
  TWELVE_HOURS = 43200000,
  ONE_HOUR = 3600000,
  THIRTY_MINUTES = 1800000,
  TEN_MINUTES = 600000,
  FIVE_MINUTES = 300000,
  THREE_MINUTES = 180000,
  TWO_MINUTES = 120000,
  ONE_MINUTE = 60000,
  THIRTY_SECONDS = 30000,
}

export enum CacheKeys {
  CONFIG_STORE = 'CONFIG_STORE',
  TOOL_CACHE = 'TOOL_CACHE',
  ROLES = 'ROLES',
  GEN_TITLE = 'GEN_TITLE',
  TOOLS = 'TOOLS',
  MODELS_CONFIG = 'MODELS_CONFIG',
  MODEL_QUERIES = 'MODEL_QUERIES',
  STARTUP_CONFIG = 'STARTUP_CONFIG',
  ENDPOINT_CONFIG = 'ENDPOINT_CONFIG',
  TOKEN_CONFIG = 'TOKEN_CONFIG',
  APP_CONFIG = 'APP_CONFIG',
  ABORT_KEYS = 'ABORT_KEYS',
  BANS = 'BANS',
  ENCODED_DOMAINS = 'ENCODED_DOMAINS',
  AUDIO_RUNS = 'AUDIO_RUNS',
  MESSAGES = 'MESSAGES',
  FLOWS = 'FLOWS',
  PENDING_REQ = 'PENDING_REQ',
  S3_EXPIRY_INTERVAL = 'S3_EXPIRY_INTERVAL',
  OPENID_EXCHANGED_TOKENS = 'OPENID_EXCHANGED_TOKENS',
  OPENID_SESSION = 'OPENID_SESSION',
  SAML_SESSION = 'SAML_SESSION',
  ADMIN_OAUTH_EXCHANGE = 'ADMIN_OAUTH_EXCHANGE',
}

export enum ViolationTypes {
  FILE_UPLOAD_LIMIT = 'file_upload_limit',
  ILLEGAL_MODEL_REQUEST = 'illegal_model_request',
  TOKEN_BALANCE = 'token_balance',
  BAN = 'ban',
  TTS_LIMIT = 'tts_limit',
  STT_LIMIT = 'stt_limit',
  RESET_PASSWORD_LIMIT = 'reset_password_limit',
  VERIFY_EMAIL_LIMIT = 'verify_email_limit',
  CONVO_ACCESS = 'convo_access',
  TOOL_CALL_LIMIT = 'tool_call_limit',
  GENERAL = 'general',
  LOGINS = 'logins',
  CONCURRENT = 'concurrent',
  NON_BROWSER = 'non_browser',
  MESSAGE_LIMIT = 'message_limit',
  REGISTRATIONS = 'registrations',
}

export enum ErrorTypes {
  NO_USER_KEY = 'no_user_key',
  EXPIRED_USER_KEY = 'expired_user_key',
  INVALID_USER_KEY = 'invalid_user_key',
  NO_BASE_URL = 'no_base_url',
  INVALID_BASE_URL = 'invalid_base_url',
  MODERATION = 'moderation',
  INPUT_LENGTH = 'INPUT_LENGTH',
  INVALID_REQUEST = 'invalid_request_error',
  INVALID_ACTION = 'invalid_action_error',
  NO_SYSTEM_MESSAGES = 'no_system_messages',
  GOOGLE_ERROR = 'google_error',
  GOOGLE_TOOL_CONFLICT = 'google_tool_conflict',
  INVALID_AGENT_PROVIDER = 'invalid_agent_provider',
  MISSING_MODEL = 'missing_model',
  MODELS_NOT_LOADED = 'models_not_loaded',
  ENDPOINT_MODELS_NOT_LOADED = 'endpoint_models_not_loaded',
  AUTH_FAILED = 'auth_failed',
  REFUSAL = 'refusal',
  STREAM_EXPIRED = 'stream_expired',
}

export enum AuthKeys {
  GOOGLE_SERVICE_KEY = 'GOOGLE_SERVICE_KEY',
  GOOGLE_API_KEY = 'GOOGLE_API_KEY',
  ANTHROPIC_API_KEY = 'ANTHROPIC_API_KEY',
}

export enum ImageDetailCost {
  LOW = 85,
  HIGH = 170,
  // eslint-disable-next-line @typescript-eslint/no-duplicate-enum-values
  ADDITIONAL = 85,
}

export enum SettingsTabValues {
  GENERAL = 'general',
  CHAT = 'chat',
  SPEECH = 'speech',
  BETA = 'beta',
  DATA = 'data',
  BALANCE = 'balance',
  ACCOUNT = 'account',
  COMMANDS = 'commands',
  PERSONALIZATION = 'personalization',
}

export enum STTProviders {
  OPENAI = 'openai',
  AZURE_OPENAI = 'azureOpenAI',
}

export enum TTSProviders {
  OPENAI = 'openai',
  AZURE_OPENAI = 'azureOpenAI',
  ELEVENLABS = 'elevenlabs',
  LOCALAI = 'localai',
}

export enum Constants {
  VERSION = 'v0.8.6-rc1',
  CONFIG_VERSION = '1.3.11',
  NO_PARENT = '00000000-0000-0000-0000-000000000000',
  USE_PRELIM_RESPONSE_MESSAGE_ID = 'USE_PRELIM_RESPONSE_MESSAGE_ID',
  NEW_CONVO = 'new',
  PENDING_CONVO = 'PENDING',
  SEARCH = 'search',
  ENCODED_DOMAIN_LENGTH = 10,
  CURRENT_MODEL = 'current_model',
  COMMON_DIVIDER = '__',
  COMMANDS_MAX_LENGTH = 56,
  DEFAULT_STREAM_RATE = 1,
  SAVED_TAG = 'Saved',
  MAX_CONVO_STARTERS = 4,
  mcp_delimiter = '_mcp_',
  mcp_prefix = 'mcp_',
  mcp_all = 'sys__all__sys',
  mcp_clear = 'sys__clear__sys',
  spec_defaults_key = '__defaults__',
  mcp_server = 'sys__server__sys',
  LC_TRANSFER_TO_ = 'lc_transfer_to_',
  EPHEMERAL_AGENT_ID = 'ephemeral',
  PROGRAMMATIC_TOOL_CALLING = 'run_tools_with_code',
  BASH_PROGRAMMATIC_TOOL_CALLING = 'run_tools_with_bash',
  SUBAGENT = 'subagent',
}

export const MAX_SUBAGENTS = 10;
export const MAX_SUBAGENT_DEPTH = 5;
export const MAX_SUBAGENT_GRAPH_NODES = 50;
export const MAX_SUBAGENT_RUN_CONFIGS = 100;

export enum LocalStorageKeys {
  APP_TITLE = 'appTitle',
  LAST_CONVO_SETUP = 'lastConversationSetup',
  LAST_MODEL = 'lastSelectedModel',
  LAST_TOOLS = 'lastSelectedTools',
  LAST_SPEC = 'lastSelectedSpec',
  FILES_TO_DELETE = 'filesToDelete',
  ASST_ID_PREFIX = 'assistant_id__',
  AGENT_ID_PREFIX = 'agent_id__',
  FORK_SETTING = 'forkSetting',
  REMEMBER_FORK_OPTION = 'rememberDefaultFork',
  FORK_SPLIT_AT_TARGET = 'splitAtTarget',
  TEXT_DRAFT = 'textDraft_',
  FILES_DRAFT = 'filesDraft_',
  LAST_PROMPT_CATEGORY = 'lastPromptCategory',
  ENABLE_USER_MSG_MARKDOWN = 'enableUserMsgMarkdown',
  AUTO_EXPAND_TOOLS = 'autoExpandTools',
  LAST_MCP_ = 'LAST_MCP_',
  LAST_CODE_TOGGLE_ = 'LAST_CODE_TOGGLE_',
  LAST_WEB_SEARCH_TOGGLE_ = 'LAST_WEB_SEARCH_TOGGLE_',
  LAST_FILE_SEARCH_TOGGLE_ = 'LAST_FILE_SEARCH_TOGGLE_',
  LAST_ARTIFACTS_TOGGLE_ = 'LAST_ARTIFACTS_TOGGLE_',
  LAST_SKILLS_TOGGLE_ = 'LAST_SKILLS_TOGGLE_',
  LAST_AGENT_PROVIDER = 'lastAgentProvider',
  LAST_AGENT_MODEL = 'lastAgentModel',
  PIN_MCP_ = 'PIN_MCP_',
  PIN_WEB_SEARCH_ = 'PIN_WEB_SEARCH_',
  PIN_CODE_INTERPRETER_ = 'PIN_CODE_INTERPRETER_',
}

export enum ForkOptions {
  DIRECT_PATH = 'directPath',
  INCLUDE_BRANCHES = 'includeBranches',
  TARGET_LEVEL = 'targetLevel',
  DEFAULT = 'default',
}

export enum CohereConstants {
  API_URL = 'https://api.cohere.ai/v1',
  ROLE_USER = 'USER',
  ROLE_SYSTEM = 'SYSTEM',
  ROLE_CHATBOT = 'CHATBOT',
  TITLE_MESSAGE = 'TITLE:',
}

export enum SystemCategories {
  ALL = 'sys__all__sys',
  MY_PROMPTS = 'sys__my__prompts__sys',
  NO_CATEGORY = 'sys__no__category__sys',
  SHARED_PROMPTS = 'sys__shared__prompts__sys',
}

export const providerEndpointMap = {
  [EModelEndpoint.openAI]: EModelEndpoint.openAI,
  [EModelEndpoint.bedrock]: EModelEndpoint.bedrock,
  [EModelEndpoint.anthropic]: EModelEndpoint.anthropic,
  [EModelEndpoint.azureOpenAI]: EModelEndpoint.azureOpenAI,
};

export const specialVariables = {
  current_date: true,
  current_user: true,
  iso_datetime: true,
  current_datetime: true,
};

export type TSpecialVarLabel = `com_ui_special_var_${keyof typeof specialVariables}`;
