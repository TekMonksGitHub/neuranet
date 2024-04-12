/**
 * LLM history based chat for Enterprise AI.
 * 
 * Request params
 * 	id - The user ID
 *  org - User's Org
 *  session_id - The session ID for a previous session if this is a continuation
 *  prompt - The chat prompt
 *  brainid - The brain ID
 *  auto_summary - Set to true to reduce session size but can cause response errors
 *  <anything else> - Used to expand the prompt, including user's queries
 * 
 * The Response is an object
 *  result - true or false
 *  reason - set to one of the reasons if result is false
 *  response - the AI response, as a plain text
 *  session_id - the session ID which can be used to ask backend to maintain sessions
 *  metadatas - the response document metadatas. typically metadata.referencelink points
 * 				to the exact document
 * 
 * (C) 2023 TekMonks. All rights reserved.
 */

const mustache = require("mustache");
const utils = require(`${CONSTANTS.LIBDIR}/utils.js`);
const NEURANET_CONSTANTS = LOGINAPP_CONSTANTS.ENV.NEURANETAPP_CONSTANTS;
const quota = require(`${NEURANET_CONSTANTS.LIBDIR}/quota.js`);
const aiapp = require(`${NEURANET_CONSTANTS.LIBDIR}/aiapp.js`);
const llmchat = require(`${NEURANET_CONSTANTS.LIBDIR}/llmchat.js`);
const llmflowrunner = require(`${NEURANET_CONSTANTS.LIBDIR}/llmflowrunner.js`);
const langdetector = require(`${NEURANET_CONSTANTS.THIRDPARTYDIR}/langdetector.js`);
const simplellm = require(`${NEURANET_CONSTANTS.LIBDIR}/simplellm.js`);

const REASONS = llmflowrunner.REASONS, CHAT_MODEL_DEFAULT = "chat-knowledgebase-gpt35-turbo", 
    DEBUG_MODE = NEURANET_CONSTANTS.CONF.debug_mode, DEFAULT_MAX_MEMORY_TOKENS = 1000;

/**
 * Runs the LLM. 
 * 
 * @param {Object} params Request params documented below
 * 	                          id - The user ID
 *                            org - User's Org
 *                            session_id - The session ID for a previous session if this is a continuation
 *                            prompt - The chat prompt
 * 							  brainid - The brain ID
 * 							  auto_summary - Set to true to reduce session size but can cause response errors
 *                            <anything else> - Used to expand the prompt, including user's queries
 * @param {Object} _llmstepDefinition Not used.
 * 
 * @returns {Object} The Response is an object
 *  	                 result - true or false
 *  	                 reason - set to one of the reasons if result is false
 *  	                 response - the AI response, as a plain text
 *  	                 session_id - the session ID which can be used to ask backend to maintain sessions
 *  	                 metadatas - the response document metadatas. typically metadata.referencelink points
 * 					                 to the exact document
 */
exports.answer = async (params) => {
	const id = params.id, org = params.org, session_id = params.session_id;

	LOG.debug(`Got LLM_History chat request from ID ${id} of org ${org}. Incoming params are ${JSON.stringify(params)}`);

	if (!(await quota.checkQuota(id, org))) {
		LOG.error(`Disallowing the API call, as the user ${id} of org ${org} is over their quota.`);
		return {reason: REASONS.LIMIT, ...CONSTANTS.FALSE_RESULT};
	}

	const chatsession = llmchat.getUsersChatSession(id, session_id).chatsession;
	const aiModelToUseForChat = params.model.name||CHAT_MODEL_DEFAULT, 
		aiModelObjectForChat = await aiapp.getAIModel(aiModelToUseForChat, params.model.model_overrides, 
			params.id, params.org, params.brainid);
	const aiModuleToUse = `${NEURANET_CONSTANTS.LIBDIR}/${aiModelObjectForChat.driver.module}`
	let aiLibrary; try{aiLibrary = utils.requireWithDebug(aiModuleToUse, DEBUG_MODE);} catch (err) {
		LOG.error("Bad AI Library or model - "+aiModuleToUse); 
		return {reason: REASONS.BAD_MODEL, ...CONSTANTS.FALSE_RESULT};
	}
	const finalSessionObject = chatsession.length ? await llmchat.trimSession(
		aiModelObjectForChat.max_memory_tokens||DEFAULT_MAX_MEMORY_TOKENS,
		llmchat.jsonifyContentsInThisSession(chatsession), aiModelObjectForChat, 
		aiModelObjectForChat.token_approximation_uplift, aiModelObjectForChat.tokenizer, aiLibrary) : [];
	if (finalSessionObject.length) finalSessionObject[finalSessionObject.length-1].last = true;

	const languageDetectedForQuestion =  langdetector.getISOLang(params.question)

	if (params.rephrasequestion && finalSessionObject.length > 0) {
		const standaloneQuestionResult = await simplellm.prompt_answer(params[`prompt_for_question_rephrasing_${languageDetectedForQuestion}`] || params.prompt_for_question_rephrasing, id, org, 
			{session: finalSessionObject, question: params.question}, aiModelObjectForChat);
		if (!standaloneQuestionResult) LOG.error("Couldn't create a stand alone version of the user's question, continuing with the originial question.");
		else params.question = standaloneQuestionResult;
	}

	const documentResultsForPrompt = params.documents;	// if no documents found, shortcircuit with no knowledge error
	if ((!documentResultsForPrompt) || (!documentResultsForPrompt.length)) return {reason: REASONS.NOKNOWLEDGE, ...CONSTANTS.FALSE_RESULT};
	
	const documentsForPrompt = [], metadatasForResponse = []; for (const [i,documentResult] of documentResultsForPrompt.entries()) {
		documentsForPrompt.push({content: documentResult.text, document_index: i+1}); metadatasForResponse.push(documentResult.metadata) };
	const knowledgebasePromptTemplate =  params[`prompt_${languageDetectedForQuestion}`] || params.prompt;
	const knowledegebaseWithQuestion = mustache.render(knowledgebasePromptTemplate, {...params, documents: documentsForPrompt});

	const paramsChat = { id, org, maintain_session: true, session_id, model: aiModelObjectForChat,
        session: [{"role": aiModelObjectForChat.user_role, "content": knowledegebaseWithQuestion}],
		auto_chat_summary_enabled: params.auto_summary||false, raw_question: params.question };
	const response = await llmchat.chat(paramsChat);

	return {...response, metadatas: metadatasForResponse};
}
