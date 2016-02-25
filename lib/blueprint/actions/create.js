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
        request.yar.flash("error", `In path: ${request.path} "MODEL" must be passed with CREATE - blueprint settings.`);
        return reply.redirect("/");
    }

    const validation = data["validation"];
    if (validation) {
        const errors = validation(request.payload);
        if (errors && errors.length > 0) {
            request.yar.flash("error", {"form": errors});
            request.yar.flash("record", request.payload);
            return reply.redirect(request.info.referrer);
        }
    }

    Async.auto({

        "createRecord": (autoCallback) => {

            model.create(request.payload, autoCallback);
        },
        "updateVersion": ["createRecord", (autoCallback) => { // increment version
            
            const version = data["version"];
            if (!version) {
                return autoCallback();
            }
            version(request, version, `Create | ${request.path}`, autoCallback);
        }]
    }, (error, result) => {

        if (error || !result.createRecord) {
            console.log(error);
            request.yar.flash("error", error || "Record could not created.");
            return reply.redirect(request.info.referrer);
        }

        request.yar.flash("success", "Successfully created!");
        return reply.redirect(request.pre["baseurl"]);
    });
};