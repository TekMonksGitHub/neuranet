/**
 * Tests the TF.IDF DB and algorithms within it.
 * 
 * (C) 2023 Tekmonks. All rights reserved.
 */

const fs = require("fs");
const path = require("path");
const serverutils = require(`${CONSTANTS.LIBDIR}/utils.js`);
const NEURANET_CONSTANTS = LOGINAPP_CONSTANTS.ENV.NEURANETAPP_CONSTANTS;
const aitfidfdb = require(`${NEURANET_CONSTANTS.LIBDIR}/aitfidfdb.js`);

const TEST_ID = "test@tekmonks.com", TEST_ORG = "Tekmonks";

exports.runTestsAsync = async function(argv) {
    if ((!argv[0]) || (argv[0].toLowerCase() != "tfidftest")) {
        LOG.console(`Skipping TF.IDF DB test case, not called.\n`)
        return;
    }
    if (!argv[1]) {LOG.console("Missing test file path/s.\n"); return;} 
    const filesToIngest = argv.slice(1); let query;

    const _logAndShowMsg = msg => {LOG.error(msg); LOG.console(msg+"\n");}
    const _testFailed = err => {const error=`Error TF.IDF testing failed.${err?" Error was "+err:""}`; _logAndShowMsg(error);}

    try{
        let createdMetadata; for (const [i,fileToIngest] of filesToIngest.entries()) {
            if ((i == filesToIngest.length -1) && (!fs.existsSync(fileToIngest))) { // if last arg not a file then must be a query
                query = fileToIngest; continue; }
            createdMetadata = await _testIngestion(path.resolve(fileToIngest), i+1);  // test ingestion
            if (!createdMetadata) {_testFailed("Ingestion failed for file "+fileToIngest); return false;}
            else _logAndShowMsg("Ingestion succeeded for file "+fileToIngest);
        }
    
        if (query) {
            const queryResult = await _testQuery(query);  // test query
            if (!queryResult) {_testFailed("Query failed."); return false;}
        }

        const newMetadata = {...createdMetadata, update_test: true, neuranet_docid: "testdoctest3"};
        const updatedMetadata = await _testUpdate(createdMetadata, newMetadata);  // test query
        if ((!updatedMetadata) || (!updatedMetadata.update_test)) {_testFailed("Update failed."); return false;}
        return true;
    } catch (err) {
        _testFailed(err); return false; } 
    finally {
        await (await _getTFIDFDBForIDAndOrg(TEST_ID, TEST_ORG)).flush(); }    
}

async function _testIngestion(pathIn, docindex) {
    LOG.console(`Test case for TF.IDF ingestion called to ingest file ${pathIn}.\n`);

    const tfidfDB = await _getTFIDFDBForIDAndOrg(TEST_ID, TEST_ORG, true);  
    const metadata = {id: TEST_ID, org: TEST_ORG, fullpath: pathIn}; 
    metadata[NEURANET_CONSTANTS.NEURANET_DOCID] = "testdoc"+docindex;  
    try {await tfidfDB.ingestStream(fs.createReadStream(pathIn, "utf8"), metadata); return metadata;}
    catch (err) {
        LOG.error(`TF.IDF ingestion failed for path ${pathIn} for ID ${TEST_ID} and org ${TEST_ORG} with error ${err}.`); 
        return false;
    }
}

async function _testQuery(query) {
    const tfidfDB = await _getTFIDFDBForIDAndOrg(TEST_ID, TEST_ORG);  
    const queryResult = await tfidfDB.query(query, 3, null, 0, undefined, undefined, true);
    if (!queryResult) return null;
    const logMsg = `Query result is ${JSON.stringify(queryResult, null, 2)}.\n`; LOG.info(logMsg); LOG.console(logMsg);
    return queryResult;
}

async function _testUpdate(metadataOld, metadataNew) {
    const tfidfDB = await _getTFIDFDBForIDAndOrg(TEST_ID, TEST_ORG);  
    return await tfidfDB.update(metadataOld, metadataNew);
}

async function _getTFIDFDBForIDAndOrg(id, org, clean) {
    const tfidfDB_ID = `${id}_${org}`, testdir = `${__dirname}/temp/tfidf_db/${tfidfDB_ID}`;
    if (clean) {
        serverutils.rmrf(testdir);  // clean it for testing
        fs.mkdirSync(testdir, {recursive: true});
    }
    const tfidfdb = await aitfidfdb.get_tfidf_db(testdir, NEURANET_CONSTANTS.NEURANET_DOCID, 
        NEURANET_CONSTANTS.NEURANET_LANGID, `${NEURANET_CONSTANTS.CONFDIR}/stopwords-iso.json`);
    return tfidfdb;
}