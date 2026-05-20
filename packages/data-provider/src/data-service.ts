import type { AxiosResponse } from 'axios';
import type * as t from './types';
import * as endpoints from './api-endpoints';
import * as a from './types/assistants';
import * as m from './types/mutations';
import * as q from './types/queries';
import * as f from './types/files';
import * as sk from './types/skills';
import * as config from './config';
import request from './request';
import * as s from './schemas';
import * as r from './roles';
import * as permissions from './accessPermissions';
import type {
  CookingDraft,
  CookingSession,
  CookingSessionEvent,
  GenerateCookingDraftRequest,
  UpdateCookingDraftRequest,
  StartCookingSessionRequest,
  CompleteCookingSessionRequest,
  SavedRecipe,
  SavedRecipesQuery,
  SavedRecipesResponse,
  SaveRecipeRequest,
  UpdateSavedRecipeRequest,
} from './types/cooking';
import type {
  PreferencesChatRequest,
  PreferencesChatResponse,
  PreferencesDocument,
  UpdatePreferencesRequest,
} from './types/preferences';

export function revokeUserKey(name: string): Promise<unknown> {
  return request.delete(endpoints.revokeUserKey(name));
}

export function revokeAllUserKeys(): Promise<unknown> {
  return request.delete(endpoints.revokeAllUserKeys());
}

export function deleteUser(payload?: t.TDeleteUserRequest): Promise<unknown> {
  return request.deleteWithOptions(endpoints.deleteUser(), { data: payload });
}

export function getFavorites(): Promise<q.TUserFavorite[]> {
  return request.get(`${endpoints.apiBaseUrl()}/api/user/settings/favorites`);
}

export function updateFavorites(favorites: q.TUserFavorite[]): Promise<q.TUserFavorite[]> {
  return request.post(`${endpoints.apiBaseUrl()}/api/user/settings/favorites`, { favorites });
}

export function getPreferences(): Promise<PreferencesDocument> {
  return request.get(endpoints.preferences());
}

export function updatePreferences(payload: UpdatePreferencesRequest): Promise<PreferencesDocument> {
  return request.put(endpoints.preferences(), payload);
}

export function chatPreferences(payload: PreferencesChatRequest): Promise<PreferencesChatResponse> {
  return request.post(endpoints.preferencesChat(), payload);
}

export function generateCookingDraft(payload: GenerateCookingDraftRequest): Promise<CookingDraft> {
  return request.post(endpoints.cookingDraftsGenerate(), payload);
}

export function getCookingDraftByConversation(conversationId: string): Promise<CookingDraft> {
  return request.get(endpoints.cookingDraftByConversation(conversationId));
}

export function updateCookingDraft(
  draftId: string,
  payload: UpdateCookingDraftRequest,
): Promise<CookingDraft> {
  return request.patch(endpoints.cookingDraft(draftId), payload);
}

export function startCookingSession(payload: StartCookingSessionRequest): Promise<CookingSession> {
  return request.post(endpoints.cookingSessions(), payload);
}

export function getCookingSession(sessionId: string): Promise<CookingSession> {
  return request.get(endpoints.cookingSession(sessionId));
}

export function appendCookingSessionEvent(
  sessionId: string,
  event: CookingSessionEvent,
): Promise<CookingSession> {
  return request.post(endpoints.cookingSessionEvents(sessionId), { event });
}

export function completeCookingSession(
  sessionId: string,
  payload: CompleteCookingSessionRequest,
): Promise<CookingSession> {
  return request.post(endpoints.cookingSessionComplete(sessionId), payload);
}

function savedRecipesQueryString(params: SavedRecipesQuery): string {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value != null && String(value).trim()) {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

export function saveRecipe(payload: SaveRecipeRequest): Promise<SavedRecipe> {
  return request.post(endpoints.recipes(), payload);
}

export function getRecipes(params: SavedRecipesQuery = {}): Promise<SavedRecipesResponse> {
  return request.get(endpoints.recipes(savedRecipesQueryString(params)));
}

export function getRecipe(recipeId: string): Promise<SavedRecipe> {
  return request.get(endpoints.recipe(recipeId));
}

export function getSavedRecipeByDraft(draftId: string): Promise<SavedRecipe> {
  return request.get(endpoints.recipeByDraft(draftId));
}

export function updateSavedRecipe(
  recipeId: string,
  payload: UpdateSavedRecipeRequest,
): Promise<SavedRecipe> {
  return request.patch(endpoints.recipe(recipeId), payload);
}

/**
 * Skill favorites (star-a-skill). The backend route is phase 2 — see the
 * original UI PR for the client surface. Until then, these resolve with
 * an empty list so the UI hooks compile and the Star button is a no-op.
 */
export function getSkillFavorites(): Promise<string[]> {
  return Promise.resolve([] as string[]);
}

export function updateSkillFavorites(skillFavorites: string[]): Promise<string[]> {
  return Promise.resolve(skillFavorites);
}

/** Per-user skill active/inactive overrides. */
export function getSkillStates(): Promise<sk.TSkillStatesResponse> {
  return request.get(endpoints.skillStates());
}

export function updateSkillStates(
  skillStates: sk.TSkillStatesResponse,
): Promise<sk.TSkillStatesResponse> {
  return request.post(endpoints.skillStates(), { skillStates });
}

export function getSharedMessages(shareId: string): Promise<t.TSharedMessagesResponse> {
  return request.get(endpoints.shareMessages(shareId));
}

export const listSharedLinks = async (
  params: q.SharedLinksListParams,
): Promise<q.SharedLinksResponse> => {
  const { pageSize, isPublic, sortBy, sortDirection, search, cursor } = params;

  return request.get(
    endpoints.getSharedLinks(pageSize, isPublic, sortBy, sortDirection, search, cursor),
  );
};

export function getSharedLink(conversationId: string): Promise<t.TSharedLinkGetResponse> {
  return request.get(endpoints.getSharedLink(conversationId));
}

export function createSharedLink(
  conversationId: string,
  targetMessageId?: string,
): Promise<t.TSharedLinkResponse> {
  return request.post(endpoints.createSharedLink(conversationId), { targetMessageId });
}

export function updateSharedLink(shareId: string): Promise<t.TSharedLinkResponse> {
  return request.patch(endpoints.updateSharedLink(shareId));
}

export function deleteSharedLink(shareId: string): Promise<m.TDeleteSharedLinkResponse> {
  return request.delete(endpoints.shareMessages(shareId));
}

export function updateUserKey(payload: t.TUpdateUserKeyRequest) {
  const { value } = payload;
  if (!value) {
    throw new Error('value is required');
  }

  return request.put(endpoints.keys(), payload);
}

export function getAgentApiKeys(): Promise<t.TAgentApiKeyListResponse> {
  return request.get(endpoints.apiKeys());
}

export function createAgentApiKey(
  payload: t.TAgentApiKeyCreateRequest,
): Promise<t.TAgentApiKeyCreateResponse> {
  return request.post(endpoints.apiKeys(), payload);
}

export function deleteAgentApiKey(id: string): Promise<void> {
  return request.delete(endpoints.apiKeyById(id));
}

export function getSearchEnabled(): Promise<boolean> {
  return request.get(endpoints.searchEnabled());
}

export function getUser(): Promise<t.TUser> {
  return request.get(endpoints.user());
}

export function getUserBalance(): Promise<t.TBalanceResponse> {
  return request.get(endpoints.balance());
}

export const updateTokenCount = (text: string) => {
  return request.post(endpoints.tokenizer(), { arg: text });
};

export const login = (payload: t.TLoginUser): Promise<t.TLoginResponse> => {
  return request.post(endpoints.login(), payload);
};

export const logout = (): Promise<m.TLogoutResponse> => {
  return request.post(endpoints.logout());
};

export const register = (payload: t.TRegisterUser) => {
  return request.post(endpoints.register(), payload);
};

export const userKeyQuery = (name: string): Promise<t.TCheckUserKeyResponse> =>
  request.get(endpoints.userKeyQuery(name));

export const getLoginGoogle = () => {
  return request.get(endpoints.loginGoogle());
};

export const requestPasswordReset = (
  payload: t.TRequestPasswordReset,
): Promise<t.TRequestPasswordResetResponse> => {
  return request.post(endpoints.requestPasswordReset(), payload);
};

export const resetPassword = (payload: t.TResetPassword) => {
  return request.post(endpoints.resetPassword(), payload);
};

export const verifyEmail = (payload: t.TVerifyEmail): Promise<t.VerifyEmailResponse> => {
  return request.post(endpoints.verifyEmail(), payload);
};

export const resendVerificationEmail = (
  payload: t.TResendVerificationEmail,
): Promise<t.VerifyEmailResponse> => {
  return request.post(endpoints.resendVerificationEmail(), payload);
};

export const getAvailablePlugins = (): Promise<s.TPlugin[]> => {
  return request.get(endpoints.plugins());
};

export const updateUserPlugins = (payload: t.TUpdateUserPlugins) => {
  return request.post(endpoints.userPlugins(), payload);
};

export const bindActionOAuth = (actionId: string): Promise<{ success: boolean }> => {
  return request.post(endpoints.actionOAuthBind(actionId));
};

/* Config */

export const getStartupConfig = (): Promise<
  config.TStartupConfig & {
    mcpCustomUserVars?: Record<string, { title: string; description: string }>;
  }
> => {
  return request.get(endpoints.config());
};

export const getAIEndpoints = (): Promise<t.TEndpointsConfig> => {
  return request.get(endpoints.aiEndpoints());
};

export const getModels = async (): Promise<t.TModelsConfig> => {
  return request.get(endpoints.models());
};

export const getToolCalls = (params: q.GetToolCallParams): Promise<q.ToolCallResults> => {
  return request.get(
    endpoints.agents({
      path: 'tools/calls',
      options: params,
    }),
  );
};

/* Files */

export const getFiles = (): Promise<f.TFile[]> => {
  return request.get(endpoints.files());
};

/**
 * Poll the lifecycle of an inline file preview. Returns the smallest
 * shape needed to drive the UI:
 *   - `status` always present (defaults to `'ready'` server-side for
 *     legacy records that pre-date the field).
 *   - `text` and `textFormat` only when `status === 'ready'` and text
 *     was extracted (preserves the HTML-or-null security contract).
 *   - `previewError` only when `status === 'failed'`.
 *
 * Called from `useFilePreview`; React Query's `refetchInterval`
 * polls while `status === 'pending'` and stops on terminal status.
 */
export const getFilePreview = (fileId: string): Promise<f.TFilePreview> => {
  return request.get(endpoints.filePreview(fileId));
};

export const getFileConfig = (): Promise<f.FileConfig> => {
  return request.get(`${endpoints.files()}/config`);
};

export const uploadImage = (
  data: FormData,
  signal?: AbortSignal | null,
): Promise<f.TFileUpload> => {
  const requestConfig = signal ? { signal } : undefined;
  return request.postMultiPart(endpoints.images(), data, requestConfig);
};

export const uploadFile = (data: FormData, signal?: AbortSignal | null): Promise<f.TFileUpload> => {
  const requestConfig = signal ? { signal } : undefined;
  return request.postMultiPart(endpoints.files(), data, requestConfig);
};

/**
 * Imports a conversations file.
 *
 * @param data - The FormData containing the file to import.
 * @returns A Promise that resolves to the import start response.
 */
export const importConversationsFile = (data: FormData): Promise<t.TImportResponse> => {
  return request.postMultiPart(endpoints.importConversation(), data);
};

export const uploadAvatar = (data: FormData): Promise<f.AvatarUploadResponse> => {
  return request.postMultiPart(endpoints.avatar(), data);
};

export const getFileDownload = async (userId: string, file_id: string): Promise<AxiosResponse> => {
  return request.getResponse(`${endpoints.files()}/download/${userId}/${file_id}`, {
    responseType: 'blob',
    headers: {
      Accept: 'application/octet-stream',
    },
  });
};

export const getFileDownloadURL = async (
  userId: string,
  file_id: string,
): Promise<f.FileDownloadURLResponse> => {
  return request.get(`${endpoints.files()}/download-url/${userId}/${file_id}`);
};

export const getCodeOutputDownload = async (url: string): Promise<AxiosResponse> => {
  return request.getResponse(url, {
    responseType: 'blob',
    headers: {
      Accept: 'application/octet-stream',
    },
  });
};

export const deleteFiles = async (payload: {
  files: f.BatchFile[];
  agent_id?: string;
  assistant_id?: string;
  tool_resource?: a.EToolResources;
}): Promise<f.DeleteFilesResponse> =>
  request.deleteWithOptions(endpoints.files(), {
    data: payload,
  });

/* Speech */

export const speechToText = (data: FormData): Promise<f.SpeechToTextResponse> => {
  return request.postMultiPart(endpoints.speechToText(), data);
};

export const textToSpeech = (data: FormData): Promise<ArrayBuffer> => {
  return request.postTTS(endpoints.textToSpeechManual(), data);
};

export const getVoices = (): Promise<f.VoiceResponse> => {
  return request.get(endpoints.textToSpeechVoices());
};

export const getCustomConfigSpeech = (): Promise<t.TCustomConfigSpeechResponse> => {
  return request.get(endpoints.getCustomConfigSpeech());
};

/* conversations */

export function duplicateConversation(
  payload: t.TDuplicateConvoRequest,
): Promise<t.TDuplicateConvoResponse> {
  return request.post(endpoints.duplicateConversation(), payload);
}

export function forkConversation(payload: t.TForkConvoRequest): Promise<t.TForkConvoResponse> {
  return request.post(endpoints.forkConversation(), payload);
}

export function deleteConversation(payload: t.TDeleteConversationRequest) {
  return request.deleteWithOptions(endpoints.deleteConversation(), { data: { arg: payload } });
}

export function clearAllConversations(): Promise<unknown> {
  return request.delete(endpoints.deleteAllConversation());
}

export const listConversations = (
  params?: q.ConversationListParams,
): Promise<q.ConversationListResponse> => {
  return request.get(endpoints.conversations(params ?? {}));
};

export function getConversations(cursor: string): Promise<t.TGetConversationsResponse> {
  return request.get(endpoints.conversations({ cursor }));
}

export function getConversationById(id: string): Promise<s.TConversation> {
  return request.get(endpoints.conversationById(id));
}

export function updateConversation(
  payload: t.TUpdateConversationRequest,
): Promise<t.TUpdateConversationResponse> {
  return request.post(endpoints.updateConversation(), { arg: payload });
}

export function archiveConversation(
  payload: t.TArchiveConversationRequest,
): Promise<t.TArchiveConversationResponse> {
  return request.post(endpoints.archiveConversation(), { arg: payload });
}

export function genTitle(payload: m.TGenTitleRequest): Promise<m.TGenTitleResponse> {
  return request.get(endpoints.genTitle(payload.conversationId));
}

export const listMessages = (params?: q.MessagesListParams): Promise<q.MessagesListResponse> => {
  return request.get(endpoints.messages(params ?? {}));
};

export function updateMessage(payload: t.TUpdateMessageRequest): Promise<unknown> {
  const { conversationId, messageId, text } = payload;
  if (!conversationId) {
    throw new Error('conversationId is required');
  }

  return request.put(endpoints.messages({ conversationId, messageId }), { text });
}

export function updateMessageContent(payload: t.TUpdateMessageContent): Promise<unknown> {
  const { conversationId, messageId, index, text } = payload;
  if (!conversationId) {
    throw new Error('conversationId is required');
  }

  return request.put(endpoints.messages({ conversationId, messageId }), { text, index });
}

export const editArtifact = async ({
  messageId,
  ...params
}: m.TEditArtifactRequest): Promise<m.TEditArtifactResponse> => {
  return request.post(endpoints.messagesArtifacts(messageId), params);
};

export const branchMessage = async (
  payload: m.TBranchMessageRequest,
): Promise<m.TBranchMessageResponse> => {
  return request.post(endpoints.messagesBranch(), payload);
};

export function getMessagesByConvoId(conversationId: string): Promise<s.TMessage[]> {
  if (
    conversationId === config.Constants.NEW_CONVO ||
    conversationId === config.Constants.PENDING_CONVO
  ) {
    return Promise.resolve([]);
  }
  return request.get(endpoints.messages({ conversationId }));
}

export function getCategories(): Promise<t.TGetCategoriesResponse> {
  return request.get(endpoints.getCategories());
}

/* Skills */

export function listSkills(params?: sk.TSkillListRequest): Promise<sk.TSkillListResponse> {
  return request.get(endpoints.listSkillsWithFilters(params ?? {}));
}

export function getSkill(id: string): Promise<sk.TSkill> {
  return request.get(endpoints.getSkill(id));
}

export function createSkill(payload: sk.TCreateSkill): Promise<sk.TSkill> {
  return request.post(endpoints.skills(), payload);
}

export function updateSkill(variables: sk.TUpdateSkillVariables): Promise<sk.TUpdateSkillResponse> {
  return request.patch(endpoints.getSkill(variables.id), {
    expectedVersion: variables.expectedVersion,
    ...variables.payload,
  });
}

export function deleteSkill(id: string): Promise<sk.TDeleteSkillResponse> {
  return request.delete(endpoints.getSkill(id));
}

export function listSkillFiles(skillId: string): Promise<sk.TListSkillFilesResponse> {
  return request.get(endpoints.skillFiles(skillId));
}

export function uploadSkillFile(skillId: string, formData: FormData): Promise<sk.TSkillFile> {
  return request.postMultiPart(endpoints.skillFiles(skillId), formData);
}

/**
 * Import a skill from a .md, .zip, or .skill file. The backend extracts the
 * archive, creates the skill from SKILL.md, and persists all additional files.
 * Single HTTP request — no client-side zip processing needed.
 */
export function importSkill(formData: FormData): Promise<sk.TSkill> {
  return request.postMultiPart(endpoints.importSkill(), formData);
}

export function getSkillFileContent(
  skillId: string,
  relativePath: string,
): Promise<sk.TSkillFileContentResponse> {
  return request.get(endpoints.skillFile(skillId, relativePath));
}

export function deleteSkillFile(
  skillId: string,
  relativePath: string,
): Promise<sk.TDeleteSkillFileResponse> {
  return request.delete(endpoints.skillFile(skillId, relativePath));
}

/* -------------------------------------------------------------------------- */
/* Skill Tree (nodes) — phase 2 backend                                       */
/* -------------------------------------------------------------------------- */
/* These were introduced by the original UI PR and are shipped as stubs in    */
/* phase 1 so the tree UI compiles. Each resolves with empty/no-op data until */
/* the backend persists a folder hierarchy. The call surface matches what the */
/* tree hooks expect so wiring real endpoints later is a one-line swap.       */

export const getSkillTree = (_skillId: string): Promise<t.TSkillTreeResponse> => {
  return Promise.resolve({ nodes: [] });
};

export const createSkillNode = (
  skillId: string,
  data: FormData | t.TCreateSkillNodeRequest,
): Promise<t.TSkillNode> => {
  const name = data instanceof FormData ? (data.get('name') as string) || 'untitled' : data.name;
  const type = data instanceof FormData ? 'file' : data.type;
  const now = new Date().toISOString();
  return Promise.resolve({
    _id: `pending-${now}`,
    skillId,
    parentId: null,
    type,
    name,
    order: 0,
    author: '',
    createdAt: now,
    updatedAt: now,
  });
};

export const updateSkillNode = (variables: {
  skillId: string;
  nodeId: string;
  data: t.TUpdateSkillNodeRequest;
}): Promise<t.TSkillNode> => {
  const now = new Date().toISOString();
  return Promise.resolve({
    _id: variables.nodeId,
    skillId: variables.skillId,
    parentId: variables.data.parentId ?? null,
    type: 'file',
    name: variables.data.name ?? '',
    order: variables.data.order ?? 0,
    author: '',
    createdAt: now,
    updatedAt: now,
  });
};

export const deleteSkillNode = (_variables: { skillId: string; nodeId: string }): Promise<void> => {
  return Promise.resolve();
};

export const getSkillNodeContent = (_variables: {
  skillId: string;
  nodeId: string;
}): Promise<{ content: string; mimeType: string }> => {
  return Promise.resolve({ content: '', mimeType: 'text/plain' });
};

export const updateSkillNodeContent = (variables: {
  skillId: string;
  nodeId: string;
  content: string;
}): Promise<t.TSkillNode> => {
  const now = new Date().toISOString();
  return Promise.resolve({
    _id: variables.nodeId,
    skillId: variables.skillId,
    parentId: null,
    type: 'file',
    name: '',
    order: 0,
    author: '',
    createdAt: now,
    updatedAt: now,
  });
};

/* Roles */
export function listRoles(): Promise<q.ListRolesResponse> {
  return request.get(`${endpoints.adminRoles()}?limit=200`);
}

export function getRole(roleName: string): Promise<r.TRole> {
  return request.get(endpoints.getRole(roleName));
}

export function updateAgentPermissions(
  variables: m.UpdateAgentPermVars,
): Promise<m.UpdatePermResponse> {
  return request.put(endpoints.updateAgentPermissions(variables.roleName), variables.updates);
}

export function updateMemoryPermissions(
  variables: m.UpdateMemoryPermVars,
): Promise<m.UpdatePermResponse> {
  return request.put(endpoints.updateMemoryPermissions(variables.roleName), variables.updates);
}

export function updatePeoplePickerPermissions(
  variables: m.UpdatePeoplePickerPermVars,
): Promise<m.UpdatePermResponse> {
  return request.put(
    endpoints.updatePeoplePickerPermissions(variables.roleName),
    variables.updates,
  );
}

export function updateRemoteAgentsPermissions(
  variables: m.UpdateRemoteAgentsPermVars,
): Promise<m.UpdatePermResponse> {
  return request.put(
    endpoints.updateRemoteAgentsPermissions(variables.roleName),
    variables.updates,
  );
}

export function updateSkillPermissions(
  variables: m.UpdateSkillPermVars,
): Promise<m.UpdatePermResponse> {
  return request.put(endpoints.updateSkillPermissions(variables.roleName), variables.updates);
}

/* Tags */
export function getConversationTags(): Promise<t.TConversationTagsResponse> {
  return request.get(endpoints.conversationTags());
}

export function createConversationTag(
  payload: t.TConversationTagRequest,
): Promise<t.TConversationTagResponse> {
  return request.post(endpoints.conversationTags(), payload);
}

export function updateConversationTag(
  tag: string,
  payload: t.TConversationTagRequest,
): Promise<t.TConversationTagResponse> {
  return request.put(endpoints.conversationTags(tag), payload);
}
export function deleteConversationTag(tag: string): Promise<t.TConversationTagResponse> {
  return request.delete(endpoints.conversationTags(tag));
}

export function addTagToConversation(
  conversationId: string,
  payload: t.TTagConversationRequest,
): Promise<t.TTagConversationResponse> {
  return request.put(endpoints.addTagToConversation(conversationId), payload);
}
export function rebuildConversationTags(): Promise<t.TConversationTagsResponse> {
  return request.post(endpoints.conversationTags('rebuild'));
}

export function healthCheck(): Promise<string> {
  return request.get(endpoints.health());
}

export function getUserTerms(): Promise<t.TUserTermsResponse> {
  return request.get(endpoints.userTerms());
}

export function acceptTerms(): Promise<t.TAcceptTermsResponse> {
  return request.post(endpoints.acceptUserTerms());
}

export function getBanner(): Promise<t.TBannerResponse> {
  return request.get(endpoints.banner());
}

export function updateFeedback(
  conversationId: string,
  messageId: string,
  payload: t.TUpdateFeedbackRequest,
): Promise<t.TUpdateFeedbackResponse> {
  return request.put(endpoints.feedback(conversationId, messageId), payload);
}

// 2FA
export function enableTwoFactor(payload?: t.TEnable2FARequest): Promise<t.TEnable2FAResponse> {
  return request.post(endpoints.enableTwoFactor(), payload);
}

export function verifyTwoFactor(payload: t.TVerify2FARequest): Promise<t.TVerify2FAResponse> {
  return request.post(endpoints.verifyTwoFactor(), payload);
}

export function confirmTwoFactor(payload: t.TVerify2FARequest): Promise<t.TVerify2FAResponse> {
  return request.post(endpoints.confirmTwoFactor(), payload);
}

export function disableTwoFactor(payload?: t.TDisable2FARequest): Promise<t.TDisable2FAResponse> {
  return request.post(endpoints.disableTwoFactor(), payload);
}

export function regenerateBackupCodes(
  payload?: t.TRegenerateBackupCodesRequest,
): Promise<t.TRegenerateBackupCodesResponse> {
  return request.post(endpoints.regenerateBackupCodes(), payload);
}

export function verifyTwoFactorTemp(
  payload: t.TVerify2FATempRequest,
): Promise<t.TVerify2FATempResponse> {
  return request.post(endpoints.verifyTwoFactorTemp(), payload);
}

/* Memories */
export const getMemories = (): Promise<q.MemoriesResponse> => {
  return request.get(endpoints.memories());
};

export const deleteMemory = (key: string): Promise<void> => {
  return request.delete(endpoints.memory(key));
};

export const updateMemory = (
  key: string,
  value: string,
  originalKey?: string,
): Promise<q.TUserMemory> => {
  return request.patch(endpoints.memory(originalKey || key), { key, value });
};

export const updateMemoryPreferences = (preferences: {
  memories: boolean;
}): Promise<{ updated: boolean; preferences: { memories: boolean } }> => {
  return request.patch(endpoints.memoryPreferences(), preferences);
};

export const createMemory = (data: {
  key: string;
  value: string;
}): Promise<{ created: boolean; memory: q.TUserMemory }> => {
  return request.post(endpoints.memories(), data);
};

export function searchPrincipals(
  params: q.PrincipalSearchParams,
): Promise<q.PrincipalSearchResponse> {
  return request.get(endpoints.searchPrincipals(params));
}

export function getAccessRoles(
  resourceType: permissions.ResourceType,
): Promise<q.AccessRolesResponse> {
  return request.get(endpoints.getAccessRoles(resourceType));
}

export function getResourcePermissions(
  resourceType: permissions.ResourceType,
  resourceId: string,
): Promise<permissions.TGetResourcePermissionsResponse> {
  return request.get(endpoints.getResourcePermissions(resourceType, resourceId));
}

export function updateResourcePermissions(
  resourceType: permissions.ResourceType,
  resourceId: string,
  data: permissions.TUpdateResourcePermissionsRequest,
): Promise<permissions.TUpdateResourcePermissionsResponse> {
  return request.put(endpoints.updateResourcePermissions(resourceType, resourceId), data);
}

export function getEffectivePermissions(
  resourceType: permissions.ResourceType,
  resourceId: string,
): Promise<permissions.TEffectivePermissionsResponse> {
  return request.get(endpoints.getEffectivePermissions(resourceType, resourceId));
}

export function getAllEffectivePermissions(
  resourceType: permissions.ResourceType,
): Promise<permissions.TAllEffectivePermissionsResponse> {
  return request.get(endpoints.getAllEffectivePermissions(resourceType));
}

// SharePoint Graph API Token
export function getGraphApiToken(params: q.GraphTokenParams): Promise<q.GraphTokenResponse> {
  return request.get(endpoints.graphToken(params.scopes));
}

export function getDomainServerBaseUrl(): string {
  return `${endpoints.apiBaseUrl()}/api`;
}

/* Active Jobs */
export interface ActiveJobsResponse {
  activeJobIds: string[];
}

export const getActiveJobs = (): Promise<ActiveJobsResponse> => {
  return request.get(endpoints.activeJobs());
};
