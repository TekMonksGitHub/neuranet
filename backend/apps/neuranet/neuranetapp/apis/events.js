/**
 * Processes and informs about Neuranet events.
 * 
 * (C) 2023 Tekmonks Corp. All rights reserved.
 * License: See the enclosed LICENSE file.
 */

const blackboard = require(`${CONSTANTS.LIBDIR}/blackboard.js`);
const NEURANET_CONSTANTS = LOGINAPP_CONSTANTS.ENV.NEURANETAPP_CONSTANTS;

const EVENTS_KEY = "__org_monkshu_neuranet_events_key", MEM_TO_USE = CLUSTER_MEMORY;

exports.initSync = _ => blackboard.subscribe(NEURANET_CONSTANTS.NEURANETEVENT, message => {
    if ((message.type != NEURANET_CONSTANTS.EVENTS.AIDB_FILE_PROCESSING && 
        message.type != NEURANET_CONSTANTS.EVENTS.AIDB_FILE_PROCESSED) || (!message.path)) return;  // we only care about these two

    const usermemory = _getUserMemory(message.id, message.org);
    if(message.subtype===NEURANET_CONSTANTS.FILEINDEXER_FILE_PROCESSED_EVENT_TYPES.PROGRESS_PERCENTAGE) message = calculatePercentage(message,usermemory);
    usermemory[message.cmspath] = {...message, path: message.cmspath,   // overwrite full path as we don't want top send this out
    done:  message.type == NEURANET_CONSTANTS.EVENTS.AIDB_FILE_PROCESSED, result: message.result, percentage:message.percentage};
    _setUserMemory(message.id, message.org, usermemory);
});

exports.doService = async jsonReq => {
    if (!validateRequest(jsonReq)) {LOG.error("Validation failure."); return CONSTANTS.FALSE_RESULT;}

    const usermemory = _getUserMemory(jsonReq.id, jsonReq.org);
    return {events: (usermemory||{}), ...CONSTANTS.TRUE_RESULT};
}

const calculatePercentage = (message, usermemory) => {
    const previousPercentage = usermemory[message.cmspath].percentage;
    let percentageWeight;
    if(message.stepName===NEURANET_CONSTANTS.FILEINDEXER_FILE_PROCESSED_EVENT_PROGRESS_PERCENTAGE_NAMES.INITIAL) percentageWeight = NEURANET_CONSTANTS.PERCENTAGE_INITIAL;
    if(message.stepName===NEURANET_CONSTANTS.FILEINDEXER_FILE_PROCESSED_EVENT_PROGRESS_PERCENTAGE_NAMES.PREGEN) percentageWeight = NEURANET_CONSTANTS.PERCENTAGE_PREGEN_STEPS/message.noOfSteps;
    const updatedPercentage = previousPercentage+percentageWeight;
    message.percentage = updatedPercentage
    return message;
}

const _setUserMemory = (id, org, usermemory) => { const memory = MEM_TO_USE.get(EVENTS_KEY, {}); 
    memory[_getmemkey(id, org)] = usermemory; MEM_TO_USE.set(EVENTS_KEY, memory); }
const _getUserMemory = (id, org) => { const memory = MEM_TO_USE.get(EVENTS_KEY, {});
    if (!memory[_getmemkey(id, org)])  memory[_getmemkey(id, org)] = {}; return memory[_getmemkey(id, org)]; }
const _getmemkey = (id, org) => `${id}_${org}`;

const validateRequest = jsonReq => (jsonReq && jsonReq.id && jsonReq.org);