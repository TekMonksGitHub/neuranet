/**
 * translating the text and returning as response.
 * 
 * (C) 2024 TekMonks. All rights reserved.
 * License: See the enclosed LICENSE file.
 */

const NEURANET_CONSTANTS = LOGINAPP_CONSTANTS.ENV.NEURANETAPP_CONSTANTS;
const aiapp = require(`${NEURANET_CONSTANTS.LIBDIR}/aiapp.js`);
const simplellm = require(`${NEURANET_CONSTANTS.LIBDIR}/simplellm.js`);
const langdetector = require(`${NEURANET_CONSTANTS.THIRDPARTYDIR}/langdetector.js`);

async function translate(params) {
    try{
        if(!params.request.tolang) throw new Error("Missing required Params");

        const modelObject = await aiapp.getAIModel(params.model.name, params.model.model_overrides, params.id, params.org, params.aiappid);

        const langDetected = langdetector.getISOLang(params.query);
        const promptToUse =  params[`prompt_${langDetected}`] || params.prompt;
        
        const translatedText = await simplellm.prompt_answer(promptToUse, params.id, params.org, 
        params.aiappid, params.request, modelObject);

        LOG.info(`text translation of ${params.query} is ${translatedText}`);
        return { result: true, text: translatedText }
    }catch(error) {
        LOG.error(`text translation failed, reason:${error.message}`);
        return { result: false, error: error.message }
    }
}

module.exports = {translate}
