/**
 * Utility functions for Neuranet AI.
 * 
 * (C) 2023 Tekmonks. All rights reserved.
 */

const path = require("path");
const mustache = require("mustache");
const fspromises = require("fs").promises;
const serverutils = require(`${CONSTANTS.LIBDIR}/utils.js`);
const fs = require('fs');
const yaml = require('js-yaml');
const NEURANET_CONSTANTS = LOGINAPP_CONSTANTS.ENV.NEURANETAPP_CONSTANTS;

const DEBUG_RUN = NEURANET_CONSTANTS.CONF.debug_mode;
const PROMPT_CACHE = {};
const modified_times = {};

exports.getPrompt = async function(promptFile) {
    const pathToFile = path.resolve(promptFile);

    if (DEBUG_RUN) {
        const lastModTimeForPrompt = (await fspromises.stat(pathToFile)).mtimeMs;
        if (lastModTimeForPrompt == modified_times[pathToFile]) return PROMPT_CACHE[pathToFile];
        PROMPT_CACHE[pathToFile] = await fspromises.readFile(promptFile, "utf-8");
        modified_times[pathToFile] = lastModTimeForPrompt;
    }

    if (!PROMPT_CACHE[pathToFile]) PROMPT_CACHE[pathToFile] = await fspromises.readFile(pathToFile, "utf-8");
    return PROMPT_CACHE[pathToFile];
}

exports.getAIModel = async function(model_name, overrides) {
    const _overrideModel = async model => { 
        if (model.inherits) {
            const basemodel = await exports.getAIModel(model.inherits);
            for (const [key, value] of Object.entries(model)) serverutils.setObjProperty(basemodel, key, value);
            model = basemodel;
        }
        if (overrides) for (const [key, value] of Object.entries(overrides)) serverutils.setObjProperty(model, key, value);
        return model;
    }
    if ((!DEBUG_RUN) && NEURANET_CONSTANTS.CONF.ai_models[model_name]) return await _overrideModel(serverutils.clone(NEURANET_CONSTANTS.CONF.ai_models[model_name]));

    const confFile = await fspromises.readFile(`${NEURANET_CONSTANTS.CONFDIR}/neuranet.json`, "utf8");
    const renderedFile = mustache.render(confFile, NEURANET_CONSTANTS);
    const jsonConf = JSON.parse(renderedFile);
    NEURANET_CONSTANTS.CONF.ai_models[model_name] = jsonConf.ai_models[model_name];   // update cached models

    const model = serverutils.clone(NEURANET_CONSTANTS.CONF.ai_models[model_name]);
    return await _overrideModel(model);
}


exports.getQuota = function (id, org) {
    try {
        const quotas = yaml.load(fs.readFileSync(`${CONSTANTS.ROOTDIR}/../apps/neuranet/aiapps/tekmonks/tkmaiapp/tkmaiapp.yaml`, 'utf8'));
        if (quotas[org] && quotas[org][id]) {
            LOG.debug(`Quota found for ID ${id} under org ${org}: ${quotas[org][id]}`);
            return parseFloat(quotas[org][id]);
        } else {
            LOG.warn(`No specific quota found for ID ${id} under org ${org}.`);
        }
        if (quotas[org] && quotas[org].defaultQuota) {
            LOG.debug(`Using default quota for org ${org}: ${quotas[org].defaultQuota}`);
            return parseFloat(quotas[org].defaultQuota);
        } else {
            LOG.warn(`No default quota found for org ${org}.`);
        }
        if (quotas._global && quotas._global.defaultQuota) {
            LOG.debug(`Using global default quota: ${quotas._global.defaultQuota}`);
            return parseFloat(quotas._global.defaultQuota);
        } else {
            LOG.error(`No global default quota found.`);
        }
        LOG.warn(`Falling back to default quota.`);
        return DEFAULT_QUOTA;
    } catch (err) {
        LOG.error(`Failed to load quotas from YAML: ${err.message}`);
        return DEFAULT_QUOTA;
    }
};