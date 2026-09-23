const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const BACKUP_DIR = path.join(__dirname, '..', 'backups');

// Ensure backups directory exists
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// All active collections in POS & ERP system
const COLLECTIONS_TO_BACKUP = [
  'users',
  'tables',
  'items',
  'orders',
  'payments',
  'ingredients',
  'customers',
  'restaurantsettings',
  'staffs',
  'expenses',
  'cashiershifts',
  'recipes',
  'coupons',
  'branches',
  'auditlogs'
];

/**
 * Creates a comprehensive timestamped JSON database backup archive
 */
const createDatabaseBackup = async (triggerType = 'manual') => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `tamanna-pos-backup-${timestamp}.json`;
    const filePath = path.join(BACKUP_DIR, filename);

    const backupData = {
      meta: {
        system: 'Tamanna Restaurant Pure Veg POS',
        version: '2.0.0',
        createdAt: new Date().toISOString(),
        triggerType,
        databaseName: mongoose.connection.name || 'restaurant_pos'
      },
      collections: {}
    };

    let totalRecords = 0;

    for (const colName of COLLECTIONS_TO_BACKUP) {
      try {
        const collection = mongoose.connection.collection(colName);
        const docs = await collection.find({}).toArray();
        backupData.collections[colName] = docs;
        totalRecords += docs.length;
      } catch (colErr) {
        backupData.collections[colName] = [];
      }
    }

    fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), 'utf-8');
    const stats = fs.statSync(filePath);

    // Rotate older backups: keep only last 14 backups
    cleanOldBackups(14);

    console.log(`[Backup Success] Created ${filename} (${(stats.size / 1024).toFixed(2)} KB, ${totalRecords} records)`);

    return {
      success: true,
      filename,
      filePath,
      sizeBytes: stats.size,
      sizeKb: Number((stats.size / 1024).toFixed(2)),
      totalRecords,
      createdAt: backupData.meta.createdAt
    };
  } catch (error) {
    console.error('[Backup Error]:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Lists all existing database backup files
 */
const listDatabaseBackups = () => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) return [];

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.json'))
      .map(filename => {
        const fullPath = path.join(BACKUP_DIR, filename);
        const stats = fs.statSync(fullPath);
        return {
          filename,
          sizeKb: Number((stats.size / 1024).toFixed(2)),
          createdAt: stats.birthtime || stats.mtime
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return files;
  } catch (error) {
    console.error('[List Backups Error]:', error.message);
    return [];
  }
};

/**
 * Restores all collections from a selected backup file
 */
const restoreDatabaseBackup = async (filename) => {
  try {
    const cleanFilename = path.basename(filename);
    const filePath = path.join(BACKUP_DIR, cleanFilename);

    if (!fs.existsSync(filePath)) {
      return { success: false, message: 'Backup file not found on server' };
    }

    const rawData = fs.readFileSync(filePath, 'utf-8');
    const backupData = JSON.parse(rawData);

    if (!backupData.collections) {
      return { success: false, message: 'Invalid backup file structure' };
    }

    let restoredCollections = 0;
    let restoredRecords = 0;

    for (const [colName, docs] of Object.entries(backupData.collections)) {
      if (Array.isArray(docs) && docs.length > 0) {
        const collection = mongoose.connection.collection(colName);
        for (const doc of docs) {
          if (doc._id) {
            const docId = typeof doc._id === 'string' && mongoose.isValidObjectId(doc._id) 
              ? new mongoose.Types.ObjectId(doc._id) 
              : doc._id;
            await collection.replaceOne({ _id: docId }, doc, { upsert: true });
          } else {
            await collection.insertOne(doc);
          }
          restoredRecords++;
        }
        restoredCollections++;
      }
    }

    console.log(`[Backup Restored] Restored ${restoredRecords} records across ${restoredCollections} collections from ${cleanFilename}`);

    return {
      success: true,
      message: `Database successfully restored from ${cleanFilename}`,
      restoredCollections,
      restoredRecords
    };
  } catch (error) {
    console.error('[Restore Error]:', error.message);
    return { success: false, error: error.message };
  }
};

/**
 * Retains only the most recent N backup files
 */
const cleanOldBackups = (keepCount = 14) => {
  try {
    const backups = listDatabaseBackups();
    if (backups.length > keepCount) {
      const toDelete = backups.slice(keepCount);
      for (const b of toDelete) {
        const p = path.join(BACKUP_DIR, b.filename);
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    }
  } catch (e) {
    console.warn('Backup cleanup warning:', e.message);
  }
};

module.exports = {
  createDatabaseBackup,
  listDatabaseBackups,
  restoreDatabaseBackup,
  BACKUP_DIR
};

