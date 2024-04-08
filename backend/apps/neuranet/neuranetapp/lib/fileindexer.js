/**
 * Will index files including XBin documents in and out of the AI databases.
 * This should be the only class used for ingestion, except direct file operations
 * to XBin via XBin REST or JS APIs.
 * 
 * Bridge between drive documents including XBin and Neuranet knowledgebases.
 * 
 * (C) 2023 Tekmonks Corp. All rights reserved.
 * License: See enclosed LICENSE file.
 */

const XBIN_CONSTANTS = LOGINAPP_CONSTANTS.ENV.XBIN_CONSTANTS;
const NEURANET_CONSTANTS = LOGINAPP_CONSTANTS.ENV.NEURANETAPP_CONSTANTS;

const path = require("path");
const mustache = require("mustache");
const cms = require(`${XBIN_CONSTANTS.LIB_DIR}/cms.js`);
const blackboard = require(`${CONSTANTS.LIBDIR}/blackboard.js`);
const aidbfs = require(`${NEURANET_CONSTANTS.LIBDIR}/aidbfs.js`);
const uploadfile = require(`${XBIN_CONSTANTS.API_DIR}/uploadfile.js`);
const deletefile = require(`${XBIN_CONSTANTS.API_DIR}/deletefile.js`);
const renamefile = require(`${XBIN_CONSTANTS.API_DIR}/renamefile.js`);
const downloadfile = require(`${XBIN_CONSTANTS.API_DIR}/downloadfile.js`);
const brainhandler = require(`${NEURANET_CONSTANTS.LIBDIR}/brainhandler.js`);
const textextractor = require(`${NEURANET_CONSTANTS.LIBDIR}/textextractor.js`);
const neuranetutils = require(`${NEURANET_CONSTANTS.LIBDIR}/neuranetutils.js`);

let conf;
const DEFAULT_MINIMIMUM_SUCCESS_PERCENT = 0.5;

exports.initSync = _ => {
    conf = require(`${NEURANET_CONSTANTS.CONFDIR}/fileindexer.json`); 
    confRendered = mustache.render(JSON.stringify(conf), {APPROOT: NEURANET_CONSTANTS.APPROOT.split(path.sep).join(path.posix.sep)}); 
    conf = JSON.parse(confRendered);
    if (!conf.enabled) return;  // file indexer is disabled
    
    blackboard.subscribe(XBIN_CONSTANTS.XBINEVENT, message => _handleFileEvent(message));
    blackboard.subscribe(NEURANET_CONSTANTS.NEURANETEVENT, message => _handleFileEvent(message));
    _initPluginsAsync(); 
}

/**
 * Adds the given file to the backend CMS repository. Will also issue new file event so the
 * file is then ingested into the backend AI databases, unless told to otherwise.
 * @param {string} id The user ID of the user ingesting this file.
 * @param {string} org The org of the user ID of the user ingesting this file.
 * @param {object} contentsOrStream File contents of read stream for the file. If contents then must be a buffer.
 * @param {string} cmspath The cms path at which to upload the file.
 * @param {string} comment The file's comment.
 * @param {object} extrainfo Extrainfo object associated with this upload.
 * @param {noaievent} boolean If true, the file is added to CMS without further AI processing 
 * @returns true on success or false on failure.
 */
exports.addFileToCMSRepository = async function(id, org, contentsOrStream, cmspath, comment, extrainfo, noaievent=false) {
    const xbinResult = await uploadfile.uploadFile(id, org, contentsOrStream, cmspath, comment, extrainfo, noaievent);
    return xbinResult.result;
}

/**
 * Removes the given file from the backend CMS repository. Will also issue delete file event so the
 * file is then uningested into the backend AI databases, unless told to otherwise.
 * @param {string} id The user ID of the user ingesting this file.
 * @param {string} org The org of the user ID of the user ingesting this file.
 * @param {string} cmspath The cms path at which to delete the file.
 * @param {object} extrainfo Extrainfo object associated with this upload.
 * @param {noaievent} boolean If true, the file is added to CMS without further AI processing 
 * @returns true on success or false on failure.
 */
exports.deleteFileFromCMSRepository = async function(id, org, cmspath, extrainfo, noaievent=false) {
    const xbinResult = await deletefile.deleteFile({xbin_id: id, xbin_org: org}, cmspath, extrainfo, noaievent);
    return xbinResult.result;
}

/**
 * Renames the given file from the backend CMS repository. Will also issue renamed file event so the
 * file is then uningested into the backend AI databases, unless told to otherwise.
 * @param {string} id The user ID of the user ingesting this file.
 * @param {string} org The org of the user ID of the user ingesting this file.
 * @param {string} cmspathFrom The cms path from which to move the file.
 * @param {string} cmspathTo The cms path to which to move the file.
 * @param {object} extrainfo Extrainfo object associated with this upload.
 * @param {noaievent} boolean If true, the file is added to CMS without further AI processing 
 * @returns true on success or false on failure.
 */
exports.renameFileFromCMSRepository = async function(id, org, cmspathFrom, cmspathTo, extrainfo, noaievent=false) {
    const xbinResult = await renamefile.renameFile({xbin_id: id, xbin_org: org}, cmspathFrom, cmspathTo, 
        extrainfo, true);
    return xbinResult.result;
}

async function _handleFileEvent(message) {
    const awaitPromisePublishFileEvent = async (promise, fullpath, type, id, org, extraInfo) => {  // this is mostly to inform listeners about file being processed events
        const cmspath = await cms.getCMSRootRelativePath({xbin_id: id, xbin_org: org}, fullpath, extraInfo);
        // we have started processing a file
        blackboard.publish(NEURANET_CONSTANTS.NEURANETEVENT, {type: NEURANET_CONSTANTS.EVENTS.AIDB_FILE_PROCESSING, 
            result: true, subtype: type, id, org, path: fullpath, cmspath, extraInfo});
        const result = await promise;   // wait for it to complete
        // we have finished processing this file
        blackboard.publish(NEURANET_CONSTANTS.NEURANETEVENT, {type: NEURANET_CONSTANTS.EVENTS.AIDB_FILE_PROCESSED, 
            path: fullpath, result: result?result.result:false, subtype: type, id, org, cmspath, extraInfo});
    }

    // only the testing classes currently use NEURANET_CONSTANTS.EVENTS.* as they directly upload to the
    // Neuranet drive instead of CMS
    const _isNeuranetFileCreatedEvent = message => message.type == XBIN_CONSTANTS.EVENTS.FILE_CREATED ||
        message.type == NEURANET_CONSTANTS.EVENTS.FILE_CREATED,
        _isNeuranetFileDeletedEvent = message => message.type == XBIN_CONSTANTS.EVENTS.FILE_DELETED ||
            message.type == NEURANET_CONSTANTS.EVENTS.FILE_DELETED,
        _isNeuranetFileRenamedEvent = message => message.type == XBIN_CONSTANTS.EVENTS.FILE_RENAMED ||
            message.type == NEURANET_CONSTANTS.EVENTS.FILE_RENAMED,
        _isNeuranetFileModifiedEvent = message => message.type == XBIN_CONSTANTS.EVENTS.FILE_MODIFIED ||
            message.type == NEURANET_CONSTANTS.EVENTS.FILE_MODIFIED;

    if (_isNeuranetFileCreatedEvent(message) && (!message.isDirectory)) 
        awaitPromisePublishFileEvent(_ingestfile(path.resolve(message.path), message.id, message.org, message.lang, message.extraInfo), 
            message.path, NEURANET_CONSTANTS.FILEINDEXER_FILE_PROCESSED_EVENT_TYPES.INGESTED, message.id, message.org, message.extraInfo);
    else if (_isNeuranetFileDeletedEvent(message) && (!message.isDirectory)) 
        awaitPromisePublishFileEvent(_uningestfile(path.resolve(message.path), message.id, message.org, message.extraInfo), 
            message.path, NEURANET_CONSTANTS.FILEINDEXER_FILE_PROCESSED_EVENT_TYPES.UNINGESTED, message.id, message.org, message.extraInfo);
    else if (_isNeuranetFileRenamedEvent(message) && (!message.isDirectory)) 
        awaitPromisePublishFileEvent(_renamefile(path.resolve(message.from), path.resolve(message.to), message.id, 
            message.org, message.extraInfo), message.to, NEURANET_CONSTANTS.FILEINDEXER_FILE_PROCESSED_EVENT_TYPES.RENAMED, message.id, 
            message.org, message.extraInfo);
    else if (_isNeuranetFileModifiedEvent(message) && (!message.isDirectory)) {
        await _uningestfile(path.resolve(message.path), message.id, message.org, message.extraInfo);
        awaitPromisePublishFileEvent(_ingestfile(path.resolve(message.path), message.id, message.org, message.lang, message.extraInfo), 
            message.path, NEURANET_CONSTANTS.FILEINDEXER_FILE_PROCESSED_EVENT_TYPES.MODIFIED, message.id, message.org, message.extraInfo);
    }
}

async function _ingestfile(pathIn, id, org, lang, extraInfo) {
    const cmspath = await cms.getCMSRootRelativePath({xbin_id: id, xbin_org: org}, pathIn, extraInfo);
    const indexer = await _getFileIndexer(pathIn, id, org, cmspath, extraInfo, lang), 
        filePluginResult = await _searchForFilePlugin(indexer);
    if (filePluginResult.plugin) return {result: await filePluginResult.plugin.ingest(indexer)};
    if (filePluginResult.error) return {result: false, cause: "Plugin validation failed."}
    else {const result = await indexer.addFileToAI(cmspath, lang); await indexer.end(); return result;}
}

async function _uningestfile(pathIn, id, org, extraInfo) {
    const cmspath = await cms.getCMSRootRelativePath({xbin_id: id, xbin_org: org}, pathIn, extraInfo);
    const indexer = await _getFileIndexer(pathIn, id, org, cmspath, extraInfo), 
        filePluginResult = await _searchForFilePlugin(indexer);
    if (filePluginResult.plugin) return {result: await filePluginResult.plugin.uningest(indexer)};
    if (filePluginResult.error) return {result: false, cause: "Plugin validation failed."}
    else {const result = await indexer.removeFileFromAI(cmspath); await indexer.end(); return result;}
}

async function _renamefile(from, to, id, org, extraInfo) {
    const cmspathFrom = await cms.getCMSRootRelativePath({xbin_id: id, xbin_org: org}, from, extraInfo);
    const cmspathTo = await cms.getCMSRootRelativePath({xbin_id: id, xbin_org: org}, to, extraInfo);
    const indexer = await _getFileIndexer(from, id, org, cmspathFrom, extraInfo), filePluginResult = await _searchForFilePlugin(indexer);
    indexer.filepathTo = to; indexer.cmspathTo = cmspathTo;
    if (filePluginResult.plugin) return {result: await filePluginResult.plugin.rename(indexer)};
    if (filePluginResult.error) return {result: false, cause: "Plugin validation failed."}
    else {const result = await indexer.renameFileToAI(cmspathFrom, cmspathTo); await indexer.end(); return result;}
}

async function _initPluginsAsync() {
    for (const file_plugin of conf.file_handling_plugins) {
        const pluginThis = NEURANET_CONSTANTS.getPlugin(file_plugin);
        if (pluginThis.initAsync) await pluginThis.initAsync();
    }
}

async function _searchForFilePlugin(fileindexerForFile) {
    for (const file_plugin of conf.file_handling_plugins) {
        const pluginThis = NEURANET_CONSTANTS.getPlugin(file_plugin);
        try {if (await pluginThis.canHandle(fileindexerForFile)) return {plugin: pluginThis, result: true, error: null};}
        catch (err) { LOG.error(`Plugin validation failed for ${file_plugin}. The error was ${err}`);
            return {error: err, result: false}}
    }

    return {error: null, result: false};
}

async function _getFileIndexer(pathIn, id, org, cmspath, extraInfo, lang) {
    return {
        filepath: pathIn, id, org, lang, minimum_success_percent: DEFAULT_MINIMIMUM_SUCCESS_PERCENT, cmspath,
        aiappid: await brainhandler.getAppID(id, org, extraInfo), extrainfo: extraInfo,
        addFileToCMSRepository: (contentBufferOrReadStream, cmspath, comment, noaievent) =>
            exports.addFileToCMSRepository(id, org, contentBufferOrReadStream, cmspath, comment, extraInfo, noaievent),
        deleteFileFromCMSRepository: (cmspath, noaievent) => exports.deleteFileFromCMSRepository(id, org, 
            cmspath, extraInfo, noaievent),
        renameFileFromCMSRepository: (cmspath, cmspathTo, noaievent) => exports.renameFileFromCMSRepository(id, org, 
            cmspath, cmspathTo, extraInfo, noaievent),
        getTextReadstream: async function(overridePath) {
            const pathToRead = overridePath||pathIn;
            const inputStream = downloadfile.getReadStream(pathToRead, false);
            const readStream = await textextractor.extractTextAsStreams(inputStream, pathToRead);
            return readStream;
        },
        getReadstream: overridePath => this.getTextReadstream(overridePath),
        getTextContents: async function(encoding) {
            try {
                const contents = await neuranetutils.readFullFile(await this.getTextReadstream(), encoding);
                return contents;
            } catch (err) {
                LOG.error(`CRITICAL: File contant extraction failed for ${this.filepath}.`);
                return null;
            }
        },
        getContents: encoding => this.getTextContents(encoding),
        start: function(){},
        end: async function() { try {await aidbfs.rebuild(id, org, this.aiappid); await aidbfs.flush(id, org, this.aiappid); return true;} catch (err) {
            LOG.error(`Error ending AI databases. The error is ${err}`); return false;} },
        //addfile, removefile, renamefile - all follow the same high level logic
        addFileToAI: async function(cmsPathThisFile=this.cmspath, langFile=this.lang) {
            try {
                const fullPath = await cms.getFullPath({xbin_id: id, xbin_org: org}, cmsPathThisFile, extraInfo);
                
                // update AI databases
                const aiDBIngestResult = await aidbfs.ingestfile(fullPath, cmsPathThisFile, id, org, this.aiappid, 
                    langFile, _=>this.getTextReadstream(fullPath), true);  // update AI databases
                if (aiDBIngestResult?.result) return CONSTANTS.TRUE_RESULT; else return CONSTANTS.FALSE_RESULT;
            } catch (err) {
                LOG.error(`Error writing file ${cmsPathThisFile} for ID ${id} and org ${org} due to ${err}.`);
                return CONSTANTS.FALSE_RESULT;
            }
        },
        removeFileFromAI: async function(cmsPathFile=this.cmspath) {
            try {
                const fullPath = await cms.getFullPath({xbin_id: id, xbin_org: org}, cmsPathFile, extraInfo);
                const aiDBUningestResult = await aidbfs.uningestfile(fullPath, id, org, this.aiappid);
                if (aiDBUningestResult?.result) return CONSTANTS.TRUE_RESULT; else return CONSTANTS.FALSE_RESULT;
            } catch (err) {
                LOG.error(`Error deleting file ${cmsPathFile} for ID ${id} and org ${org} due to ${err}.`);
                return CONSTANTS.FALSE_RESULT;
            }
        },
        renameFileToAI: async function(cmsPathFrom=this.cmspath, cmsPathTo=this.cmspathTo) {
            try {
                const fullPathFrom = await cms.getFullPath({xbin_id: id, xbin_org: org}, cmsPathFrom, extraInfo);
                const fullPathTo = await cms.getFullPath({xbin_id: id, xbin_org: org}, cmsPathTo, extraInfo);
                const aiDBRenameResult = await aidbfs.renamefile(fullPathFrom, fullPathTo, cmsPathTo, id, org, this.aiappid);
                    if (aiDBRenameResult?.result) return CONSTANTS.TRUE_RESULT; else return CONSTANTS.FALSE_RESULT;
            } catch (err) {
                LOG.error(`Error renaming file ${cmsPathFrom} for ID ${id} and org ${org} due to ${err}.`);
                return CONSTANTS.FALSE_RESULT;
            }
        }
    }
}
