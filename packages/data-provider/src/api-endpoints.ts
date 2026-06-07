import * as q from './types/queries';
import { ResourceType } from './accessPermissions';

let BASE_URL = '';
if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_URL) {
  BASE_URL = import.meta.env.VITE_API_URL;
} else if (
  typeof process === 'undefined' ||
  (process as typeof process & { browser?: boolean }).browser === true
) {
  // process is only available in node context, or process.browser is true in client-side code
  // This is to ensure that the BASE_URL is set correctly based on the <base>
  // element in the HTML document, if it exists.
  const baseEl = document.querySelector('base');
  BASE_URL = baseEl?.getAttribute('href') || '/';
}

if (BASE_URL && BASE_URL.endsWith('/')) {
  BASE_URL = BASE_URL.slice(0, -1);
}

export const apiBaseUrl = () => BASE_URL;

// Testing this buildQuery function
const buildQuery = (params: Record<string, unknown>): string => {
  const query = Object.entries(params)
    .filter(([, value]) => {
      if (Array.isArray(value)) {
        return value.length > 0;
      }
      return value !== undefined && value !== null && value !== '';
    })
    .map(([key, value]) => {
      if (Array.isArray(value)) {
        return value.map((v) => `${key}=${encodeURIComponent(v)}`).join('&');
      }
      return `${key}=${encodeURIComponent(String(value))}`;
    })
    .join('&');
  return query ? `?${query}` : '';
};

export const health = () => `${BASE_URL}/health`;
export const user = () => `${BASE_URL}/api/user`;

export const balance = () => `${BASE_URL}/api/balance`;

export const userPlugins = () => `${BASE_URL}/api/user/plugins`;

export const deleteUser = () => `${BASE_URL}/api/user/delete`;

const messagesRoot = `${BASE_URL}/api/messages`;

export const messages = (params: q.MessagesListParams) => {
  const { conversationId, messageId, ...rest } = params;

  if (conversationId && messageId) {
    return `${messagesRoot}/${conversationId}/${messageId}`;
  }

  if (conversationId) {
    return `${messagesRoot}/${conversationId}`;
  }

  return `${messagesRoot}${buildQuery(rest)}`;
};

export const messagesArtifacts = (messageId: string) => `${messagesRoot}/artifact/${messageId}`;

export const messagesBranch = () => `${messagesRoot}/branch`;

const shareRoot = `${BASE_URL}/api/share`;
export const shareMessages = (shareId: string) => `${shareRoot}/${shareId}`;
export const getSharedLink = (conversationId: string) => `${shareRoot}/link/${conversationId}`;
export const getSharedLinks = (
  pageSize: number,
  isPublic: boolean,
  sortBy: 'title' | 'createdAt',
  sortDirection: 'asc' | 'desc',
  search?: string,
  cursor?: string,
) =>
  `${shareRoot}?pageSize=${pageSize}&isPublic=${isPublic}&sortBy=${sortBy}&sortDirection=${sortDirection}${
    search ? `&search=${search}` : ''
  }${cursor ? `&cursor=${cursor}` : ''}`;
export const createSharedLink = (conversationId: string) => `${shareRoot}/${conversationId}`;
export const updateSharedLink = (shareId: string) => `${shareRoot}/${shareId}`;

const keysEndpoint = `${BASE_URL}/api/keys`;

export const keys = () => keysEndpoint;

export const userKeyQuery = (name: string) => `${keysEndpoint}?name=${name}`;

export const revokeUserKey = (name: string) => `${keysEndpoint}/${name}`;

export const revokeAllUserKeys = () => `${keysEndpoint}?all=true`;

const apiKeysEndpoint = `${BASE_URL}/api/api-keys`;

export const apiKeys = () => apiKeysEndpoint;

export const apiKeyById = (id: string) => `${apiKeysEndpoint}/${id}`;

export const conversationsRoot = `${BASE_URL}/api/convos`;

export const conversations = (params: q.ConversationListParams) => {
  return `${conversationsRoot}${buildQuery(params)}`;
};

export const conversationById = (id: string) => `${conversationsRoot}/${id}`;

export const genTitle = (conversationId: string) =>
  `${conversationsRoot}/gen_title/${encodeURIComponent(conversationId)}`;

export const updateConversation = () => `${conversationsRoot}/update`;

export const archiveConversation = () => `${conversationsRoot}/archive`;

export const deleteConversation = () => `${conversationsRoot}`;

export const deleteAllConversation = () => `${conversationsRoot}/all`;

export const importConversation = () => `${conversationsRoot}/import`;

export const forkConversation = () => `${conversationsRoot}/fork`;

export const duplicateConversation = () => `${conversationsRoot}/duplicate`;

export const search = (q: string, cursor?: string | null) =>
  `${BASE_URL}/api/search?q=${q}${cursor ? `&cursor=${cursor}` : ''}`;

export const searchEnabled = () => `${BASE_URL}/api/search/enable`;

export const aiEndpoints = () => `${BASE_URL}/api/endpoints`;

export const models = () => `${BASE_URL}/api/models`;

export const tokenizer = () => `${BASE_URL}/api/tokenizer`;

export const login = () => `${BASE_URL}/api/auth/login`;

export const logout = () => `${BASE_URL}/api/auth/logout`;

export const register = () => `${BASE_URL}/api/auth/register`;

export const loginFacebook = () => `${BASE_URL}/api/auth/facebook`;

export const loginGoogle = () => `${BASE_URL}/api/auth/google`;

export const refreshToken = (retry?: boolean) =>
  `${BASE_URL}/api/auth/refresh${retry === true ? '?retry=true' : ''}`;

export const requestPasswordReset = () => `${BASE_URL}/api/auth/requestPasswordReset`;

export const resetPassword = () => `${BASE_URL}/api/auth/resetPassword`;

export const verifyEmail = () => `${BASE_URL}/api/user/verify`;

// Auth page URLs (for client-side navigation and redirects)
export const loginPage = () => `${BASE_URL}/login`;
export const registerPage = () => `${BASE_URL}/register`;

const REDIRECT_PARAM = 'redirect_to';
const LOGIN_PATH_RE = /(?:^|\/)login(?:\/|$)/;

/**
 * Builds a `/login?redirect_to=...` URL from the given or current location.
 * Returns plain `/login` (no param) when already on a login route to prevent recursive nesting.
 */
export function buildLoginRedirectUrl(pathname?: string, search?: string, hash?: string): string {
  const p = pathname ?? window.location.pathname;
  if (LOGIN_PATH_RE.test(p)) {
    return '/login';
  }
  const s = search ?? window.location.search;
  const h = hash ?? window.location.hash;

  const stripped =
    BASE_URL && (p === BASE_URL || p.startsWith(BASE_URL + '/'))
      ? p.slice(BASE_URL.length) || '/'
      : p;
  const currentPath = `${stripped}${s}${h}`;
  if (!currentPath || currentPath === '/') {
    return '/login';
  }
  return `/login?${REDIRECT_PARAM}=${encodeURIComponent(currentPath)}`;
}

export const resendVerificationEmail = () => `${BASE_URL}/api/user/verify/resend`;

export const plugins = () => `${BASE_URL}/api/plugins`;

export const actionOAuthBind = (actionId: string) =>
  `${BASE_URL}/api/actions/${actionId}/oauth/bind`;

export const config = () => `${BASE_URL}/api/config`;

export const preferences = () => `${BASE_URL}/api/preferences`;
export const preferencesChat = () => `${BASE_URL}/api/preferences/chat`;
export const generativePrompts = () => `${BASE_URL}/api/preferences/generative-prompts`;
export const preferenceIngredients = (query?: string) => {
  const search = query?.trim() ? `?query=${encodeURIComponent(query.trim())}` : '';
  return `${BASE_URL}/api/preferences/ingredients${search}`;
};
export const resolvePreferenceIngredient = () => `${BASE_URL}/api/preferences/ingredients/resolve`;

const cookingRoot = `${BASE_URL}/api/cooking`;
const recipesRoot = `${BASE_URL}/api/recipes`;

export const cookingDraftsGenerate = () => `${cookingRoot}/drafts/generate`;
export const cookingDraftByConversation = (conversationId: string) =>
  `${cookingRoot}/drafts/by-conversation/${encodeURIComponent(conversationId)}`;
export const cookingDraft = (draftId: string) =>
  `${cookingRoot}/drafts/${encodeURIComponent(draftId)}`;
export const cookingDocuments = () => `${cookingRoot}/documents`;
export const cookingDocumentsByConversation = (conversationId: string) =>
  `${cookingRoot}/documents/by-conversation/${encodeURIComponent(conversationId)}`;
export const cookingDocument = (documentId: string) =>
  `${cookingRoot}/documents/${encodeURIComponent(documentId)}`;
export const selectCookingDocument = (documentId: string) =>
  `${cookingDocument(documentId)}/select`;
export const cookingSessions = () => `${cookingRoot}/sessions`;
export const cookingSession = (sessionId: string) =>
  `${cookingRoot}/sessions/${encodeURIComponent(sessionId)}`;
export const cookingSessionEvents = (sessionId: string) =>
  `${cookingRoot}/sessions/${encodeURIComponent(sessionId)}/events`;
export const cookingSessionComplete = (sessionId: string) =>
  `${cookingRoot}/sessions/${encodeURIComponent(sessionId)}/complete`;
export const recipes = (query = '') => `${recipesRoot}${query ? `?${query}` : ''}`;
export const recipe = (recipeId: string) => `${recipesRoot}/${encodeURIComponent(recipeId)}`;
export const recipeByDraft = (draftId: string) =>
  `${recipesRoot}/by-draft/${encodeURIComponent(draftId)}`;

export const agents = ({ path = '', options }: { path?: string; options?: object }) => {
  let url = `${BASE_URL}/api/agents`;

  if (path && path !== '') {
    url += `/${path}`;
  }

  if (options && Object.keys(options).length > 0) {
    const queryParams = new URLSearchParams(options as Record<string, string>).toString();
    url += `?${queryParams}`;
  }

  return url;
};

export const activeJobs = () => `${BASE_URL}/api/agents/chat/active`;

export const files = () => `${BASE_URL}/api/files`;
export const fileUpload = () => `${BASE_URL}/api/files`;
export const fileDelete = () => `${BASE_URL}/api/files`;
export const fileDownload = (userId: string, fileId: string) =>
  `${BASE_URL}/api/files/download/${userId}/${fileId}`;
/* Deferred-preview lifecycle endpoint. Returns
 * `{ status, text?, textFormat?, previewError? }` so the frontend can
 * poll while background HTML extraction is in flight. See PR #12957. */
export const filePreview = (fileId: string) =>
  `${BASE_URL}/api/files/${encodeURIComponent(fileId)}/preview`;
export const fileConfig = () => `${BASE_URL}/api/files/config`;

export const images = () => `${files()}/images`;

export const avatar = () => `${images()}/avatar`;

export const speech = () => `${files()}/speech`;

export const speechToText = () => `${speech()}/stt`;

export const textToSpeech = () => `${speech()}/tts`;

export const textToSpeechManual = () => `${textToSpeech()}/manual`;

export const textToSpeechVoices = () => `${textToSpeech()}/voices`;

export const getCustomConfigSpeech = () => `${speech()}/config/get`;

export const getCategories = () => `${BASE_URL}/api/categories`;

/* Skills */
export const skills = () => `${BASE_URL}/api/skills`;
export const importSkill = () => `${skills()}/import`;

export const getSkill = (id: string) => `${skills()}/${encodeURIComponent(id)}`;

export const listSkillsWithFilters = (
  filter: Record<string, string | number | undefined | null>,
) => {
  const cleaned = Object.entries(filter).reduce(
    (acc, [key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        acc[key] = String(value);
      }
      return acc;
    },
    {} as Record<string, string>,
  );
  const query =
    Object.keys(cleaned).length > 0 ? `?${new URLSearchParams(cleaned).toString()}` : '';
  return `${skills()}${query}`;
};

export const skillFiles = (id: string) => `${getSkill(id)}/files`;

export const skillFile = (id: string, relativePath: string) =>
  `${skillFiles(id)}/${encodeURIComponent(relativePath)}`;

/**
 * Skill filesystem tree (phase 2). URL shape mirrors the original UI PR so
 * the tree hooks keep their call surface. `path` is pre-encoded by the
 * caller (e.g. `${nodeId}/content`).
 */
export const skillTree = ({ skillId, path = '' }: { skillId: string; path?: string }) => {
  let url = `${BASE_URL}/api/skills/${encodeURIComponent(skillId)}/tree`;
  if (path) {
    url += `/${path}`;
  }
  return url;
};

/* Skill active states (per-user overrides) */
export const skillStates = () => `${BASE_URL}/api/user/settings/skills/active`;

/* Roles */
export const roles = () => `${BASE_URL}/api/roles`;
export const adminRoles = () => `${BASE_URL}/api/admin/roles`;
export const getRole = (roleName: string) => `${roles()}/${encodeURIComponent(roleName)}`;
export const updateMemoryPermissions = (roleName: string) => `${getRole(roleName)}/memories`;
export const updateAgentPermissions = (roleName: string) => `${getRole(roleName)}/agents`;
export const updatePeoplePickerPermissions = (roleName: string) =>
  `${getRole(roleName)}/people-picker`;
export const updateRemoteAgentsPermissions = (roleName: string) =>
  `${getRole(roleName)}/remote-agents`;
export const updateSkillPermissions = (roleName: string) => `${getRole(roleName)}/skills`;

/* Conversation Tags */
export const conversationTags = (tag?: string) =>
  `${BASE_URL}/api/tags${tag != null && tag ? `/${encodeURIComponent(tag)}` : ''}`;

export const conversationTagsList = (pageNumber: string, sort?: string, order?: string) =>
  `${conversationTags()}/list?pageNumber=${pageNumber}${sort ? `&sort=${sort}` : ''}${
    order ? `&order=${order}` : ''
  }`;

export const addTagToConversation = (conversationId: string) =>
  `${conversationTags()}/convo/${conversationId}`;

export const userTerms = () => `${BASE_URL}/api/user/terms`;
export const acceptUserTerms = () => `${BASE_URL}/api/user/terms/accept`;
export const banner = () => `${BASE_URL}/api/banner`;

// Message Feedback
export const feedback = (conversationId: string, messageId: string) =>
  `${BASE_URL}/api/messages/${conversationId}/${messageId}/feedback`;

// Two-Factor Endpoints
export const enableTwoFactor = () => `${BASE_URL}/api/auth/2fa/enable`;
export const verifyTwoFactor = () => `${BASE_URL}/api/auth/2fa/verify`;
export const confirmTwoFactor = () => `${BASE_URL}/api/auth/2fa/confirm`;
export const disableTwoFactor = () => `${BASE_URL}/api/auth/2fa/disable`;
export const regenerateBackupCodes = () => `${BASE_URL}/api/auth/2fa/backup/regenerate`;
export const verifyTwoFactorTemp = () => `${BASE_URL}/api/auth/2fa/verify-temp`;

/* Memories */
export const memories = () => `${BASE_URL}/api/memories`;
export const memory = (key: string) => `${memories()}/${encodeURIComponent(key)}`;
export const memoryPreferences = () => `${memories()}/preferences`;

export const searchPrincipals = (params: q.PrincipalSearchParams) => {
  const { q: query, limit, types } = params;
  let url = `${BASE_URL}/api/permissions/search-principals?q=${encodeURIComponent(query)}`;

  if (limit !== undefined) {
    url += `&limit=${limit}`;
  }

  if (types && types.length > 0) {
    url += `&types=${types.join(',')}`;
  }

  return url;
};

export const getAccessRoles = (resourceType: ResourceType) =>
  `${BASE_URL}/api/permissions/${resourceType}/roles`;

export const getResourcePermissions = (resourceType: ResourceType, resourceId: string) =>
  `${BASE_URL}/api/permissions/${resourceType}/${resourceId}`;

export const updateResourcePermissions = (resourceType: ResourceType, resourceId: string) =>
  `${BASE_URL}/api/permissions/${resourceType}/${resourceId}`;

export const getEffectivePermissions = (resourceType: ResourceType, resourceId: string) =>
  `${BASE_URL}/api/permissions/${resourceType}/${resourceId}/effective`;

export const getAllEffectivePermissions = (resourceType: ResourceType) =>
  `${BASE_URL}/api/permissions/${resourceType}/effective/all`;

// SharePoint Graph API Token
export const graphToken = (scopes: string) =>
  `${BASE_URL}/api/auth/graph-token?scopes=${encodeURIComponent(scopes)}`;
