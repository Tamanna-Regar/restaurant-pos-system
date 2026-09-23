const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { createDatabaseBackup, listDatabaseBackups, restoreDatabaseBackup, BACKUP_DIR } = require('../utils/databaseBackup');
const { logAudit } = require('../utils/auditLogger');

// 1. List all available backups
router.get('/', async (req, res) => {
  try {
    const backups = listDatabaseBackups();
    res.json({ success: true, data: backups });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. Trigger instant manual backup
router.post('/create', async (req, res) => {
  try {
    const result = await createDatabaseBackup('manual_admin');
    if (!result.success) {
      return res.status(500).json({ success: false, message: result.error });
    }

    if (req.user) {
      logAudit({
        branchId: req.user.branchId || null,
        userId: req.user._id,
        userName: req.user.name,
        role: req.user.role,
        action: 'DATABASE_BACKUP_CREATED',
        entity: 'SystemBackup',
        entityId: result.filename,
        details: `Backup created: ${result.filename} (${result.sizeKb} KB, ${result.totalRecords} records)`
      });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. Download a backup archive file
router.get('/download/:filename', async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(BACKUP_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Backup file not found' });
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. Restore database from backup
router.post('/restore/:filename', async (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const result = await restoreDatabaseBackup(filename);

    if (result.success && req.user) {
      logAudit({
        branchId: req.user.branchId || null,
        userId: req.user._id,
        userName: req.user.name,
        role: req.user.role,
        action: 'DATABASE_RESTORED',
        entity: 'SystemBackup',
        entityId: filename,
        details: `Database restored from ${filename}: ${result.restoredRecords} records across ${result.restoredCollections} collections`
      });
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;

