/**
 * Tests the vector and TF.IDF DB uningestions and algorithms within them.
 * 
 * (C) 2023 Tekmonks. All rights reserved.
 */
const path = require("path");
const NEURANET_CONSTANTS = LOGINAPP_CONSTANTS.ENV.NEURANETAPP_CONSTANTS;
const dblayer = require(`${NEURANET_CONSTANTS.LIBDIR}/dblayer.js`);
const unindexdoc = require(`${NEURANET_CONSTANTS.APIDIR}/unindexdoc.js`);

const TEST_ID = "test@tekmonks.com", TEST_ORG = "Tekmonks", TEST_APP = "tkmaiapp";

exports.runTestsAsync = async function(argv) {
    if ((!argv[0]) || (argv[0].toLowerCase() != "aiunindex")) {
        LOG.console(`Skipping AI DB unindex test case, not called.\n`)
        return;
    }
    if (!argv[1]) {
        LOG.console("Missing test file/s name/s.\n");
        return;
    } 
    const filesToTest = argv.slice(1);

    LOG.console(`Test case for AI DB unindexing called to unindex the files ${filesToTest.join(", ")}.\n`);

    await dblayer.initDBAsync();    // we need DB before anything else happens
    let finalResult = true; const unindexingPromises = [], unindexFile = async jsonReq => {
        const result = await unindexdoc.doService(jsonReq);
        if (result?.result) {
            const successMsg = `Test unindexing of ${jsonReq.filename} succeeded.\n`;
            LOG.info(successMsg); LOG.console(successMsg);
        } else {
            finalResult = false; const errorMsg = `Test unindexing of ${jsonReq.filename} failed.\n`;
            LOG.error(errorMsg); LOG.console(errorMsg);
        }
    };
    for (const fileToParse of filesToTest) {
        const jsonReq = {filename: path.basename(fileToParse), id: TEST_ID, org: TEST_ORG, aiappid: TEST_APP, __forceDBFlush: true}; 
        unindexingPromises.push(unindexFile(jsonReq));
    }

    await Promise.all(unindexingPromises);    // wait for all files to finish

    setInterval(_=>{}, 1000);
    return finalResult;
}