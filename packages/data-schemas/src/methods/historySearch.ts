import type { Model } from 'mongoose';
import type {
  ChatHistorySearchMatch,
  ChatHistorySearchResponse,
  ChatHistorySearchResult,
  ChatHistorySearchSource,
} from 'librechat-data-provider';
import type { IConversation, ICookingDraft, IMessage } from '~/types';

const MAX_QUERY_LENGTH = 160;
const MAX_CANDIDATES_PER_SOURCE = 150;
const MAX_MATCHES_PER_CONVERSATION = 3;
const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'for',
  'find',
  'i',
  'in',
  'is',
  'me',
  'my',
  'of',
  'on',
  'please',
  'recipe',
  'recipes',
  'the',
  'to',
  'want',
  'with',
]);

type SearchableConversation = Pick<
  IConversation,
  'conversationId' | 'title' | 'endpoint' | 'createdAt' | 'updatedAt' | 'user'
>;

type SearchableMessage = Pick<
  IMessage,
  'conversationId' | 'messageId' | 'text' | 'isCreatedByUser' | 'createdAt'
>;

type SearchableDraft = Pick<
  ICookingDraft,
  '_id' | 'conversationId' | 'documentMarkdown' | 'createdAt'
>;

type RankedMatch = ChatHistorySearchMatch & { score: number };
type MutableResult = Omit<ChatHistorySearchResult, 'matches'> & { matches: RankedMatch[] };

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

const searchableText = (value: string) => normalizeText(value).toLocaleLowerCase();

const getTokens = (query: string) => {
  const allTokens = searchableText(query).match(/[\p{L}\p{N}]+/gu) ?? [];
  const meaningfulTokens = allTokens.filter((token) => token.length > 1 && !STOP_WORDS.has(token));
  return Array.from(new Set(meaningfulTokens.length > 0 ? meaningfulTokens : allTokens)).slice(
    0,
    8,
  );
};

const buildTokenConditions = (field: string, tokens: string[]) =>
  tokens.map((token) => ({ [field]: new RegExp(escapeRegex(token), 'i') }));

const getExcerpt = (value: string, query: string, tokens: string[], maxLength = 180) => {
  const normalized = normalizeText(value.replace(/[`#>*_|~-]+/g, ' '));
  if (normalized.length <= maxLength) {
    return normalized;
  }

  const lower = normalized.toLocaleLowerCase();
  const phraseIndex = lower.indexOf(searchableText(query));
  const tokenIndexes = tokens.map((token) => lower.indexOf(token)).filter((index) => index >= 0);
  const matchIndex = phraseIndex >= 0 ? phraseIndex : Math.min(...tokenIndexes);
  const start = Math.max(0, matchIndex - Math.floor(maxLength * 0.3));
  const end = Math.min(normalized.length, start + maxLength);
  return `${start > 0 ? '...' : ''}${normalized.slice(start, end).trim()}${
    end < normalized.length ? '...' : ''
  }`;
};

const scoreText = (
  value: string,
  query: string,
  tokens: string[],
  source: ChatHistorySearchSource,
) => {
  const normalized = searchableText(value);
  const phrase = searchableText(query);
  const sourceWeight = { title: 60, canvas: 28, user: 22, assistant: 18 }[source];
  let phraseScore = 0;
  if (normalized === phrase) {
    phraseScore = 80;
  } else if (normalized.includes(phrase)) {
    phraseScore = 45;
  }
  const prefixScore = normalized.startsWith(phrase) ? 20 : 0;
  const tokenScore = tokens.reduce(
    (score, token) => score + (normalized.includes(token) ? 8 : 0),
    0,
  );
  return sourceWeight + phraseScore + prefixScore + tokenScore;
};

const recencyScore = (date?: Date) => {
  if (!date) {
    return 0;
  }
  const ageInDays = Math.max(0, (Date.now() - date.getTime()) / 86_400_000);
  return Math.max(0, 12 - Math.log2(ageInDays + 1) * 2);
};

const activeConversationConditions = [
  { $or: [{ isArchived: false }, { isArchived: { $exists: false } }] },
  { $or: [{ expiredAt: null }, { expiredAt: { $exists: false } }] },
];

export type HistorySearchMethods = {
  searchChatHistory: (
    user: string,
    input: { query: string; limit?: number },
  ) => Promise<ChatHistorySearchResponse>;
};

export function createHistorySearchMethods(
  mongoose: typeof import('mongoose'),
): HistorySearchMethods {
  async function searchChatHistory(
    user: string,
    { query, limit = 20 }: { query: string; limit?: number },
  ): Promise<ChatHistorySearchResponse> {
    const normalizedQuery = normalizeText(query).slice(0, MAX_QUERY_LENGTH);
    const tokens = getTokens(normalizedQuery);
    if (tokens.length === 0) {
      return { query: normalizedQuery, results: [] };
    }

    const resultLimit = Math.min(Math.max(limit, 1), 50);
    const Conversation = mongoose.models.Conversation as Model<IConversation>;
    const Message = mongoose.models.Message as Model<IMessage>;
    const CookingDraft = mongoose.models.CookingDraft as Model<ICookingDraft>;

    const [titleMatches, messageMatches, draftMatches] = await Promise.all([
      Conversation.find({
        user,
        $and: [...activeConversationConditions, ...buildTokenConditions('title', tokens)],
      })
        .select('conversationId title endpoint createdAt updatedAt user')
        .sort({ updatedAt: -1 })
        .limit(MAX_CANDIDATES_PER_SOURCE)
        .lean<SearchableConversation[]>(),
      Message.find({
        user,
        $and: buildTokenConditions('text', tokens),
        $or: [{ expiredAt: null }, { expiredAt: { $exists: false } }],
      })
        .select('conversationId messageId text isCreatedByUser createdAt')
        .sort({ updatedAt: -1 })
        .limit(MAX_CANDIDATES_PER_SOURCE)
        .lean<SearchableMessage[]>(),
      CookingDraft.find({
        user,
        conversationId: { $exists: true, $ne: '' },
        $and: buildTokenConditions('documentMarkdown', tokens),
      })
        .select('conversationId documentMarkdown createdAt')
        .sort({ updatedAt: -1 })
        .limit(MAX_CANDIDATES_PER_SOURCE)
        .lean<SearchableDraft[]>(),
    ]);

    const candidateIds = new Set<string>(titleMatches.map(({ conversationId }) => conversationId));
    messageMatches.forEach(({ conversationId }) => candidateIds.add(conversationId));
    draftMatches.forEach(({ conversationId }) => {
      if (conversationId) {
        candidateIds.add(conversationId);
      }
    });

    if (candidateIds.size === 0) {
      return { query: normalizedQuery, results: [] };
    }

    const conversations = await Conversation.find({
      user,
      conversationId: { $in: Array.from(candidateIds) },
      $and: activeConversationConditions,
    })
      .select('conversationId title endpoint createdAt updatedAt user')
      .lean<SearchableConversation[]>();

    const results = new Map<string, MutableResult>();
    conversations.forEach((conversation) => {
      results.set(conversation.conversationId, {
        conversationId: conversation.conversationId,
        title: conversation.title,
        endpoint: conversation.endpoint,
        createdAt: conversation.createdAt?.toISOString() ?? new Date(0).toISOString(),
        updatedAt: conversation.updatedAt?.toISOString() ?? new Date(0).toISOString(),
        user: conversation.user,
        score: recencyScore(conversation.updatedAt),
        totalMatches: 0,
        matches: [],
      });
    });

    const addMatch = (conversationId: string, match: RankedMatch) => {
      const result = results.get(conversationId);
      if (!result) {
        return;
      }
      result.totalMatches += 1;
      result.matches.push(match);
    };

    titleMatches.forEach((conversation) => {
      const title = conversation.title ?? '';
      addMatch(conversation.conversationId, {
        source: 'title',
        excerpt: getExcerpt(title, normalizedQuery, tokens),
        createdAt: conversation.updatedAt?.toISOString(),
        score: scoreText(title, normalizedQuery, tokens, 'title'),
      });
    });

    messageMatches.forEach((message) => {
      const text = message.text ?? '';
      const source = message.isCreatedByUser ? 'user' : 'assistant';
      addMatch(message.conversationId, {
        source,
        excerpt: getExcerpt(text, normalizedQuery, tokens),
        messageId: message.messageId,
        createdAt: message.createdAt?.toISOString(),
        score: scoreText(text, normalizedQuery, tokens, source),
      });
    });

    draftMatches.forEach((draft) => {
      if (!draft.conversationId) {
        return;
      }
      const markdown = draft.documentMarkdown ?? '';
      addMatch(draft.conversationId, {
        source: 'canvas',
        excerpt: getExcerpt(markdown, normalizedQuery, tokens),
        documentId: String(draft._id),
        createdAt: draft.createdAt?.toISOString(),
        score: scoreText(markdown, normalizedQuery, tokens, 'canvas'),
      });
    });

    const rankedResults = Array.from(results.values())
      .filter((result) => result.totalMatches > 0)
      .map((result) => {
        const rankedMatches = result.matches.sort((left, right) => right.score - left.score);
        const strongestMatchScore = rankedMatches
          .slice(0, MAX_MATCHES_PER_CONVERSATION)
          .reduce((score, match) => score + match.score, 0);
        const frequencyScore = Math.min(10, Math.log2(result.totalMatches + 1) * 3);
        return {
          ...result,
          score: result.score + strongestMatchScore + frequencyScore,
          matches: rankedMatches
            .slice(0, MAX_MATCHES_PER_CONVERSATION)
            .map(({ score: _score, ...match }) => match),
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, resultLimit);

    return { query: normalizedQuery, results: rankedResults };
  }

  return { searchChatHistory };
}
