import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotificationMock = vi.fn();
const setVapidDetailsMock = vi.fn();
vi.mock("web-push", () => ({
  default: { sendNotification: sendNotificationMock, setVapidDetails: setVapidDetailsMock },
}));

const findManyMock = vi.fn();
const deleteMock = vi.fn().mockResolvedValue({});
vi.mock("../db.js", () => ({ prisma: { pushSubscription: { findMany: findManyMock, delete: deleteMock } } }));

const loadEnvMock = vi.fn();
vi.mock("../env.js", () => ({ loadEnv: () => loadEnvMock() }));

const { isPushConfigured, sendPushToAdmin, sendPushToAnonymousUser } = await import("./index.js");

const CONFIGURED_ENV = { VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "mailto:a@b.com" };
const SUBSCRIPTION = { id: "sub1", endpoint: "https://push.example/1", p256dh: "p256dh", auth: "auth" };
const PAYLOAD = { title: "New message", body: "You have a new message.", url: "/admin", tag: "inbox" };

beforeEach(() => {
  vi.clearAllMocks();
  findManyMock.mockResolvedValue([SUBSCRIPTION]);
  sendNotificationMock.mockResolvedValue({});
});

describe("isPushConfigured", () => {
  it("is false when any VAPID var is missing", () => {
    loadEnvMock.mockReturnValue({ VAPID_PUBLIC_KEY: "pub" });
    expect(isPushConfigured()).toBe(false);
    expect(setVapidDetailsMock).not.toHaveBeenCalled();
  });

  it("is true and arms web-push when all three are set", () => {
    loadEnvMock.mockReturnValue(CONFIGURED_ENV);
    expect(isPushConfigured()).toBe(true);
    expect(setVapidDetailsMock).toHaveBeenCalledWith("mailto:a@b.com", "pub", "priv");
  });
});

describe("sendPushToAdmin", () => {
  it("does nothing when push isn't configured", async () => {
    loadEnvMock.mockReturnValue({});
    await sendPushToAdmin(PAYLOAD);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("sends to every admin-owned subscription", async () => {
    loadEnvMock.mockReturnValue(CONFIGURED_ENV);
    await sendPushToAdmin(PAYLOAD);
    expect(findManyMock).toHaveBeenCalledWith({ where: { adminId: { not: null } } });
    expect(sendNotificationMock).toHaveBeenCalledWith(
      { endpoint: SUBSCRIPTION.endpoint, keys: { p256dh: "p256dh", auth: "auth" } },
      JSON.stringify(PAYLOAD),
      { TTL: 3600, urgency: "normal", topic: "inbox" },
    );
  });

  it("prunes a subscription the push service reports as gone (410)", async () => {
    loadEnvMock.mockReturnValue(CONFIGURED_ENV);
    sendNotificationMock.mockRejectedValueOnce(Object.assign(new Error("gone"), { statusCode: 410 }));
    await sendPushToAdmin(PAYLOAD);
    expect(deleteMock).toHaveBeenCalledWith({ where: { id: "sub1" } });
  });

  it("leaves the subscription alone on a non-410/404 failure", async () => {
    loadEnvMock.mockReturnValue(CONFIGURED_ENV);
    sendNotificationMock.mockRejectedValueOnce(Object.assign(new Error("server error"), { statusCode: 500 }));
    await sendPushToAdmin(PAYLOAD);
    expect(deleteMock).not.toHaveBeenCalled();
  });
});

describe("sendPushToAnonymousUser", () => {
  it("does nothing when push isn't configured", async () => {
    loadEnvMock.mockReturnValue({});
    await sendPushToAnonymousUser("user1", PAYLOAD);
    expect(findManyMock).not.toHaveBeenCalled();
  });

  it("scopes the lookup to the given anonymous user", async () => {
    loadEnvMock.mockReturnValue(CONFIGURED_ENV);
    await sendPushToAnonymousUser("user1", PAYLOAD);
    expect(findManyMock).toHaveBeenCalledWith({ where: { anonymousUserId: "user1" } });
  });
});
