const webpush = require('web-push');

let configured = false;

function configureWebPush() {
  if (configured) return;

  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || 'mailto:support@babytracker.app';

  if (!publicKey || !privateKey) {
    throw new Error('Missing VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY');
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  configured = true;
}

module.exports = {
  webpush,
  configureWebPush
};
