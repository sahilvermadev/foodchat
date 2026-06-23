import type * as t from './types';
import { EndpointURLs } from './config';
import * as s from './schemas';

export default function createPayload(submission: t.TSubmission) {
  const {
    isEdited,
    addedConvo,
    userMessage,
    isContinued,
    isTemporary,
    isRegenerate,
    conversation,
    editedContent,
    ephemeralAgent,
    endpointOption,
    manualSkills,
    messages,
  } = submission;
  const { conversationId } = s.tConvoUpdateSchema.parse(conversation);
  const { endpoint: _e, endpointType: _endpointType } = endpointOption as {
    endpoint: s.EModelEndpoint;
    endpointType?: s.EModelEndpoint;
  };

  const endpoint = _e as s.EModelEndpoint;
  let server = `${EndpointURLs[s.EModelEndpoint.agents]}/${endpoint}`;
  if (endpointOption.clientOptions?.guestCookingBridge === true) {
    server = `${EndpointURLs[s.EModelEndpoint.agents].replace(
      /\/agents\/chat$/,
      '',
    )}/cooking/guest/chat`;
  }
  if (endpointOption.clientOptions?.cookingBridge === true) {
    server = `${EndpointURLs[s.EModelEndpoint.agents].replace(/\/agents\/chat$/, '')}/cooking/chat`;
  }

  const payload: t.TPayload = {
    ...userMessage,
    ...endpointOption,
    endpoint,
    addedConvo,
    isTemporary,
    isRegenerate,
    editedContent,
    conversationId,
    isContinued: !!(isEdited && isContinued),
    ephemeralAgent,
    manualSkills,
  };

  if (
    endpointOption.clientOptions?.cookingBridge === true ||
    endpointOption.clientOptions?.guestCookingBridge === true
  ) {
    payload.messages = messages;
  }

  return { server, payload };
}
