export const i18n = {
"Title" : "Neuranet",
"logintagline": "Enterprise AI Neural Networks",
"loginsubtag": "Intelligent, integrated, and easy to use.",

"NothingToConvert": "Found nothing to convert.",
"ErrorConvertingInternal": "Error in conversion, sorry.",
"ErrorConvertingBadAIModel": "Error in conversion, due to an AI model mismatch, sorry.",
"ErrorConvertingBadAPIRequest": "Error in conversion, due to network communication error, sorry.",
"ErrorConvertingBadInputSQL": "Error in conversion, due to bad input SQL.\n\n{{#message}}{{message}}{{/message}}{{^message}}SQL parser failed to parse.{{/message}}\n\nFound at: Line:{{#line}}{{line}}{{/line}}{{^line}}0{{/line}}, Column:{{#column}}{{column}}{{/column}}{{^column}}0{{/column}}.",
"PossibleErrorConvertingSQL": "--- WARNING: Possibly bad SQL.\n--- {{#message}}{{{message}}}{{/message}}{{^message}}SQL parser failed to parse.{{/message}}\n--- Found at: {{#line}}{{line}}{{/line}}{{^line}}0{{/line}}, Column:{{#column}}{{column}}{{/column}}{{^column}}0{{/column}}.\n",
"InternalErrorConverting": "Internal error, please retry later.",
"ValidateSQL": "Prevalidate input",
"ValidateSQLWarning": "Checking this will most probably generate validation errors unless the SQL is pure SQL:2016 compliant (most are not).",

"ChooseActivity": "Choose Activity",

"ChatAIError": "AI error in processing. Please reload the page to start a new conversation.",
"NeuralNetReady": "AI Neural Network<br>Ready...",
"TypeMessage": "Type Message",

"ViewLabel_gencode": "Generate code",
"ViewLabel_enterpriseassist": "Enterprise assistant",
"ViewLabel_sqltranslate": "Translate SQL",
"ViewLabel_chat": "General chat",
"ViewLabel_aiworkshop": "AI workshop",


"ErrorConvertingBadInputCode": "Error in conversion, due to bad input code.\n\n{{#message}}{{message}}{{/message}}{{^message}}Code parser failed to parse.{{/message}}\n\nFound at: Line:{{#line}}{{line}}{{/line}}{{^line}}0{{/line}}, Column:{{#column}}{{column}}{{/column}}{{^column}}0{{/column}}.",
"PossibleErrorConvertingCode": "--- WARNING: Possibly bad code.\n--- {{#message}}{{message}}{{/message}}{{^message}}Code parser failed to parse.{{/message}}\n--- Found at: {{#line}}{{line}}{{/line}}{{^line}}0{{/line}}, Column:{{#column}}{{column}}{{/column}}{{^column}}0{{/column}}.",

"ErrorConvertingAIQuotaLimit": "Your 24 hour spend quota limit has been reached. Please retry tomorrow.",

"NotImplemented": "Not implemented yet.",

"EnterpriseAssist_Done": "Done",
"EnterpriseAssist_Processing": "Reading",
"EnterpriseAssist_NoEvents": "No Events.",
"EnterpriseAssist_KnowledgeBase": "AI Training",
"EnterpriseAssist_ErrorNoKnowledge": "Sorry I have no knowledge of this topic.",
"EnterpriseAssist_AIError": "AI error in processing. Please reload the page to start a new assistant request.",
"EnterpriseAssist_ResponseTemplate": "{{response}}\n\n<span id='aireferences' style='font-size: x-small;font-weight: 100;'>References\n{{#references}}{{.}}\n{{/references}}<span>"
}