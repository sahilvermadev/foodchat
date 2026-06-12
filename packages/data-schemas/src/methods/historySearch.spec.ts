import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createModels } from '../models';
import { createHistorySearchMethods } from './historySearch';

let mongoServer: InstanceType<typeof MongoMemoryServer>;
let modelsToCleanup: string[] = [];

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const models = createModels(mongoose);
  modelsToCleanup = Object.keys(models);
  Object.assign(mongoose.models, models);
  await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
  for (const modelName of modelsToCleanup) {
    delete mongoose.models[modelName];
  }
});

beforeEach(async () => {
  await Promise.all(
    Object.values(mongoose.connection.collections).map((collection) => collection.deleteMany({})),
  );
});

describe('searchChatHistory', () => {
  it('groups and ranks matches from titles, messages, and recipe canvases', async () => {
    await mongoose.models.Conversation.create([
      {
        conversationId: 'title-convo',
        title: 'Sourdough troubleshooting',
        user: 'user-1',
        endpoint: 'openAI',
      },
      {
        conversationId: 'message-convo',
        title: 'Weekend baking',
        user: 'user-1',
        endpoint: 'openAI',
      },
      {
        conversationId: 'canvas-convo',
        title: 'Bread recipe',
        user: 'user-1',
        endpoint: 'openAI',
      },
    ]);
    await mongoose.models.Message.create({
      conversationId: 'message-convo',
      messageId: 'message-1',
      user: 'user-1',
      text: 'My sourdough starter smells fruity after feeding.',
      isCreatedByUser: true,
    });
    await mongoose.connection.collection('cookingdrafts').insertOne({
      conversationId: 'canvas-convo',
      user: 'user-1',
      prompt: 'Create bread',
      documentMarkdown: 'Use the sourdough starter when it has doubled in volume.',
      status: 'active',
      selected: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const { searchChatHistory } = createHistorySearchMethods(mongoose);
    const response = await searchChatHistory('user-1', { query: 'sourdough' });

    expect(response.results.map((result) => result.conversationId)).toEqual([
      'title-convo',
      'canvas-convo',
      'message-convo',
    ]);
    expect(response.results[1].matches[0].source).toBe('canvas');
    expect(response.results[2].matches[0]).toMatchObject({
      source: 'user',
      messageId: 'message-1',
    });
  });

  it('requires every query token and excludes other users and archived chats', async () => {
    await mongoose.models.Conversation.create([
      {
        conversationId: 'matching',
        title: 'Butter chicken dinner',
        user: 'user-1',
        endpoint: 'openAI',
      },
      {
        conversationId: 'partial',
        title: 'Butter cookies',
        user: 'user-1',
        endpoint: 'openAI',
      },
      {
        conversationId: 'archived',
        title: 'Butter chicken archive',
        user: 'user-1',
        endpoint: 'openAI',
        isArchived: true,
      },
      {
        conversationId: 'other-user',
        title: 'Butter chicken private',
        user: 'user-2',
        endpoint: 'openAI',
      },
    ]);

    const { searchChatHistory } = createHistorySearchMethods(mongoose);
    const response = await searchChatHistory('user-1', {
      query: 'Please find my butter chicken recipe?',
    });

    expect(response.results).toHaveLength(1);
    expect(response.results[0].conversationId).toBe('matching');
  });
});
