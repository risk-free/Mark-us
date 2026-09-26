/**
 * WeCom (企业微信) integration (D-06, D-11, D-12):
 *  - 微信客服 (WeChat Customer Service) inbound/outbound messaging
 *  - 客户联系 (Contact) external-user linking for assignment rules
 *  - 会话存档 (Session Archive) consent-gated chat history ingest
 *  - No automation of personal WeChat / QQ (out of scope, platform ToS)
 * Implementation lands in P3 (WeCom ↔ CRM wave).
 */

export type WeComChannel = "WECOM_KF" | "WECOM_CONTACT" | "ARCHIVE";

export interface WeComMessage {
  channel: WeComChannel;
  externalUserId: string;
  content: string;
  contentType?: "text" | "image" | "file";
}

export async function sendKfMessage(msg: WeComMessage): Promise<{ msgid: string }> {
  void msg;
  throw new Error("@markus/wechat: sendKfMessage not implemented (scaffold P0; lands in P3)");
}

export async function fetchArchive(
  openIds: string[],
  since: Date,
): Promise<unknown[]> {
  void openIds;
  void since;
  throw new Error("@markus/wechat: fetchArchive not implemented (scaffold P0; lands in P3)");
}
