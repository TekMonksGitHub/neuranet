/**
 * Calls various GPT models for OpenAI. Uses request/response not streaming.
 * (C) 2022 TekMonks. All rights reserved.
 */

const mustache = require("mustache");
const fspromises = require("fs").promises;
const rest = require(`${CONSTANTS.LIBDIR}/rest.js`);
const utils = require(`${CONSTANTS.LIBDIR}/utils.js`);
const NEURANET_CONSTANTS = LOGINAPP_CONSTANTS.ENV.NEURANETAPP_CONSTANTS;
const aiutils = require(`${NEURANET_CONSTANTS.LIBDIR}/aiutils.js`);
const langdetector = require(`${NEURANET_CONSTANTS.THIRDPARTYDIR}/../3p/langdetector.js`);

const PROMPT_VAR = "${__ORG_NEURANET_PROMPT__}", SAMPLE_MODULE_PREFIX = "module(", DEFAULT_GPT_CHARS_PER_TOKEN = 4,
    DEFAULT_GPT_TOKENS_PER_WORD = 1.25, INTERNAL_TOKENIZER = "internal", DEFAULT_GPT_TOKENIZER = "gpt-tokenizer", 
    DEFAULT_TOKEN_UPLIFT = 1.05, DEFAULT_503_RETRIES = 3;

exports.process = async function(data, promptOrPromptFile, apiKey, model, dontInflatePrompt) {
    const prompt = dontInflatePrompt ? promptOrPromptFile : mustache.render(await aiutils.getPrompt(promptOrPromptFile), data).replace(/\r\n/gm,"\n");   // create the prompt
    const modelObject = typeof model === "object" ? model : await aiutils.getAIModel(model); 
    if (!modelObject) { LOG.error(`Bad model object - ${modelObject}.`); return null; }

    const tokencount_request = await exports.countTokens(prompt, modelObject.request.model, 
        modelObject.token_approximation_uplift, modelObject.tokenizer);
    if (tokencount_request > modelObject.request.max_tokens - 1) {
        LOG.error(`Request too large for the model's context length - the token count is ${tokencount_request}, the model's max context length is ${modelObject.request.max_tokens}.`); 
        LOG.error(`The request prompt was ${JSON.stringify(prompt)}`);
        return null; 
    } 
    if (modelObject.request.max_tokens) delete modelObject.request.max_tokens;  // retaining this causes many errors in OpenAI as the tokencount is always approximate, while this value - if provided - must be absolutely accurate

    let promptObject;
    if (!modelObject.request_contentpath)
    {   
        const promptMustacheStr = JSON.stringify(modelObject.request).replace(PROMPT_VAR, "{{{prompt}}}"), 
            promptJSONStr = JSON.stringify(prompt),
            promptInjectedStr = mustache.render(promptMustacheStr, {prompt: promptJSONStr.substring(1,promptJSONStr.length-1)});
        LOG.info(`Pre JSON parsing, the raw prompt object is: ${promptJSONStr}`);
        promptObject = JSON.parse(promptInjectedStr);
    } else {
        promptObject = {...modelObject.request};
        LOG.info(`Pre JSON parsing, the raw prompt is: ${prompt}`);
        utils.setObjProperty(promptObject, modelObject.request_contentpath, JSON.parse(prompt));
    }
        
    LOG.info(`Calling AI engine for request ${JSON.stringify(data)} and prompt ${JSON.stringify(prompt)}`);
    LOG.info(`The prompt object for this call is ${JSON.stringify(promptObject)}.`);
    if (modelObject.read_ai_response_from_samples) LOG.info("Reading sample response as requested by the model.");
    
    let response, retries = 0;
    do {    // auto retry if API is overloaded (503 error)
        try {
            response = modelObject.read_ai_response_from_samples ? await _getSampleResponse(modelObject.sample_ai_response) : 
            await rest.postHttps(modelObject.driver.host, modelObject.driver.port, modelObject.driver.path,
                {"Authorization": modelObject.isBasicAuth ? `Basic ${apiKey}` : `Bearer ${apiKey}`, ...(modelObject.x_api_key ? {"x-api-key": modelObject.x_api_key} : {})}, promptObject);
            retries++;
        } catch (error) {
            LOG.error(`Error: Bad status, undefined`);
            return null;
        }
    } while (response && ( (modelObject.http_retry_codes && modelObject.http_retry_codes.includes(response.status)) || 
            ((!modelObject.http_retry_codes) && response.status == 503) ) && 
            (retries <= (modelObject.api_max_retries||DEFAULT_503_RETRIES)))

    if ((!response) || (!response.data) || (response.error)) {
        LOG.error(`Error: AI engine call error.`);
        if (response) LOG.error(`The resulting code is ${response.status} and response data is ${response.data?typeof response.data == "string"?response.data:response.data.toString():""}.`);
        else LOG.error(`The response from AI engine is null.`);
        LOG.info(`The prompt object for this call is ${JSON.stringify(promptObject)}.`);
        return null;
    }

    LOG.info(`The AI response for request ${JSON.stringify(data)} and prompt object ${JSON.stringify(promptObject)} was ${JSON.stringify(response)}`);

    const finishReason = modelObject.response_finishreason ?
            utils.getObjProperty(response, modelObject.response_finishreason) : null,
        messageContent = utils.getObjProperty(response, modelObject.response_contentpath);
        
    if (!messageContent) {
        LOG.error(`Response from AI engine for request ${JSON.stringify(data)} and prompt ${prompt} is missing content.`); return null; }
    else if (modelObject.response_finishreason && (!modelObject.response_ok_finish_reasons.includes(finishReason))) {
        LOG.error(`Response from AI engine for request ${JSON.stringify(data)} and prompt ${prompt} didn't stop properly.`); return null; }
    else return {airesponse: messageContent, metric_cost: modelObject.response_cost_of_query_path?
        utils.getObjProperty(response, modelObject.response_cost_of_query_path) : undefined};
}

exports.countTokens = async function(string, rawAIModelName, uplift=DEFAULT_TOKEN_UPLIFT, tokenizer=INTERNAL_TOKENIZER) {
    let count, encoderLib; try {
        if (tokenizer.toLowerCase() != INTERNAL_TOKENIZER) encoderLib = require(tokenizer||DEFAULT_GPT_TOKENIZER);
    } catch (err) {
        LOG.warn(`GPT3 encoder library ${tokenizer||DEFAULT_GPT_TOKENIZER} not available for estimation, using approximate estimation method instead. The error is ${err}.`);
    }
    if ((rawAIModelName.toLowerCase().includes("gpt-3") || rawAIModelName.toLowerCase().includes("gpt-4")) && encoderLib) {
        const encoded = encoderLib.encode(string);
        count = encoded.length;
    } else {
        if (encoderLib) LOG.warn(`${rawAIModelName} is not supported using encoder, using the approximate estimation method to calculate tokens.`);
        if (!encoderLib) LOG.info(`Using the approximate estimation method to calculate tokens. The tokenizer specified is ${tokenizer}.`)
        const _countWordsUsingIntl = (text, lang) => [...(new Intl.Segmenter(lang, { granularity: "word" }).segment(
            text))].reduce((wordCount, { isWordLike }) => wordCount + Number(isWordLike), 0);
        const langDetected = langdetector.getISOLang(string);
        count = ((langDetected != "ja") && (langDetected != "zh")) ? string.length/DEFAULT_GPT_CHARS_PER_TOKEN :
            (_=>{const wordcount = _countWordsUsingIntl(string, langDetected); return wordcount*DEFAULT_GPT_TOKENS_PER_WORD;})()
    }
    const tokenCount = Math.ceil(count*uplift);
    LOG.info(`Token count is ${tokenCount}. Tokenizer used is ${encoderLib?tokenizer||DEFAULT_GPT_TOKENIZER:INTERNAL_TOKENIZER}.`);
    return tokenCount;
}

async function _getSampleResponse(sampleAIReponseDirective) {
    if (!sampleAIReponseDirective.trim().startsWith(SAMPLE_MODULE_PREFIX)) return JSON.parse(await fspromises.readFile(
        `${NEURANET_CONSTANTS.RESPONSESDIR}/${sampleAIReponseDirective}`));

    const tuples = sampleAIReponseDirective.trim().split(","); for (const [i, tuple] of Object.entries(tuples)) tuples[i] = tuple.trim(); 

    const moduleToRun = tuples[0].substring(SAMPLE_MODULE_PREFIX.length, tuples[0].length-1), modulePath = `${NEURANET_CONSTANTS.RESPONSESDIR}/${moduleToRun}`;
    try {
        const moduleLoaded = require(modulePath);
        return await moduleLoaded.getSampleResponse(...tuples.slice(1));
    } catch (err) {
        LOG.error(`Error loading sample response module. Error is ${err}.`);
        return null;
    }
}