-- Add a configurable public first-contact greeting. This is site content,
-- not an encrypted chat message, because the admin private key never leaves
-- the browser.
ALTER TABLE "site_settings"
ADD COLUMN "welcomeMessage" TEXT NOT NULL
DEFAULT 'Welcome! Send a message below to start an anonymous, end-to-end encrypted conversation.';
