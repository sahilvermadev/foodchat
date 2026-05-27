import type { Connection, Types } from 'mongoose';
import logger from '~/config/winston';

type LegacyCookingDocument = {
  _id: Types.ObjectId;
  user: string;
  conversationId?: string;
  tenantId?: string;
};

type CookingDocumentMigrationResult = {
  migrated: number;
  selected: number;
  savedMigrated: number;
  illustrationsQueued: number;
  expiredDeleted: number;
  ttlIndexDropped: boolean;
};

export async function migrateCookingDocuments(
  connection: Connection,
): Promise<CookingDocumentMigrationResult> {
  const collection = connection.db!.collection('cookingdrafts');
  let ttlIndexDropped = false;

  try {
    const indexes = await collection.indexes();
    if (indexes.some((index) => index.name === 'expiresAt_1')) {
      await collection.dropIndex('expiresAt_1');
      ttlIndexDropped = true;
      logger.info('[CookingDocumentsMigration] Removed legacy draft TTL index.');
    }
  } catch {
    ttlIndexDropped = false;
  }
  const savedRecipes = connection.db!.collection('savedrecipes');
  const savedMigration = await savedRecipes.updateMany(
    { documentType: { $exists: false } },
    { $set: { documentType: 'recipe' } },
  );
  const illustrationMigration = await savedRecipes.updateMany(
    {
      documentType: { $in: ['guide', 'prep_plan'] },
      illustrationStatus: 'failed',
      illustrationData: { $exists: false },
      $or: [{ illustrationUrl: { $exists: false } }, { illustrationUrl: '' }],
    },
    { $set: { illustrationStatus: 'pending' } },
  );
  if (illustrationMigration.modifiedCount > 0) {
    logger.info(
      `[CookingDocumentsMigration] Queued ${illustrationMigration.modifiedCount} legacy cooking document illustrations.`,
    );
  }
  const expired = await collection.deleteMany({
    expiresAt: { $lte: new Date() },
    $or: [{ documentType: { $exists: false } }, { selected: { $exists: false } }],
  });

  const legacy = await collection
    .find<LegacyCookingDocument>({
      $or: [
        { documentType: { $exists: false } },
        { selected: { $exists: false } },
        { expiresAt: { $exists: true } },
      ],
    })
    .project<LegacyCookingDocument>({ _id: 1, user: 1, conversationId: 1, tenantId: 1 })
    .toArray();

  if (legacy.length === 0) {
    return {
      migrated: 0,
      selected: 0,
      savedMigrated: savedMigration.modifiedCount,
      illustrationsQueued: illustrationMigration.modifiedCount,
      expiredDeleted: expired.deletedCount,
      ttlIndexDropped,
    };
  }

  const migrated = await collection.updateMany(
    { _id: { $in: legacy.map((document) => document._id) } },
    {
      $set: { documentType: 'recipe', selected: false },
      $unset: { expiresAt: '' },
    },
  );
  const conversationKeys = new Map<string, LegacyCookingDocument>();
  for (const document of legacy) {
    if (!document.conversationId) {
      continue;
    }
    const key = `${document.tenantId ?? ''}:${document.user}:${document.conversationId}`;
    conversationKeys.set(key, document);
  }

  let selected = 0;
  for (const document of conversationKeys.values()) {
    const filter = {
      user: document.user,
      conversationId: document.conversationId,
      ...(document.tenantId ? { tenantId: document.tenantId } : {}),
      status: 'active',
    };
    const newest = await collection.findOne(filter, { sort: { updatedAt: -1 } });
    if (!newest) {
      continue;
    }
    await collection.updateOne({ _id: newest._id }, { $set: { selected: true } });
    selected += 1;
  }

  logger.info(
    `[CookingDocumentsMigration] Migrated ${migrated.modifiedCount} documents and selected ${selected} conversations.`,
  );
  return {
    migrated: migrated.modifiedCount,
    selected,
    savedMigrated: savedMigration.modifiedCount,
    illustrationsQueued: illustrationMigration.modifiedCount,
    expiredDeleted: expired.deletedCount,
    ttlIndexDropped,
  };
}
