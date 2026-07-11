const Sentry = require("@sentry/node");

Sentry.init({
  dsn: "https://f104e0956d77abbecc56cb8c72647abf@o4511718823034880.ingest.us.sentry.io/4511718892896256",
  dataCollection: {
    // userInfo: false,
    // httpBodies: [],
  },
});
