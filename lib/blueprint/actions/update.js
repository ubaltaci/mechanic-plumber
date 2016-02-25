/**
 *
 * @param {object} request
 * @param {object} request.yar - yar.
 * @param {function} request.yar.flash - flash.
 * @param {function} reply
 * @param {object} data
 * @returns {Function}
 */

"use strict";

const Async = require("async");

module.exports = (request, reply, data) => {

    const model = data["model"];
    if (!model) {
        request.yar.flash("error", `In path: ${request.path} "MODEL" must be passed with UPDATE - blueprint settings.`);
        return reply.redirect("/");
    }

    const query = data["query"];
    if (!query) {
        request.yar.flash("error", `In path: ${request.path} "QUERY" must be passed with UPDATE - blueprint settings.`);
        return reply.redirect("/");
    }

    Async.auto({

        "findRecord": (autoCallback) => {

            query.exec(autoCallback);
        },
        "updateRecord": ["findRecord", (autoCallback, result) => {

            const record = result.findRecord;
            if (!record) {
                return autoCallback(`${model.modelName} not found!`);
            }

            const validation = data["validation"];
            if (validation) {

                const errors = validation(request.payload, record);
                if (errors && errors.length > 0) {
                    return autoCallback({form: errors});
                }
            }

            Object.keys(request.payload).forEach((key) => {
                record[key] = request.payload[key];
            });

            record.save(autoCallback);
        }],
        "updateVersion": ["updateRecord", (autoCallback) => { // increment version

            const version = data["version"];
            if (!version) {
                return autoCallback();
            }
            version(request, version, `Update | ${request.path}`, autoCallback);
        }]
    }, (error, result) => {

        if (error || !result.updateRecord) {
            console.log(error);
            request.yar.flash("error", error || "Record could not updated.");
            return reply.redirect(request.info.referrer);
        }

        request.yar.flash("success", "Successfully created!");
        return reply.redirect(request.pre["baseurl"]);
    });
};