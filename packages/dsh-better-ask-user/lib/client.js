window.__ModuleLoader__.load({
  id: "dsh-better-ask-user",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  PendingQuestion: () => PendingQuestion,
  QuestionCards: () => QuestionCards,
  SettingsEntry: () => SettingsEntry,
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// ../../node_modules/.pnpm/@deepseek-ai+dsh-brand@0.2.2-rc.1_@deepseek-ai+cordis@4.0.5/node_modules/@deepseek-ai/dsh-brand/lib/index.js
function brandString(value) {
  return value;
}

// src/client/contract/slots.ts
function settlePendingComposer(settle, failureMessage) {
  try {
    settle();
    return Promise.resolve();
  } catch (error) {
    return Promise.reject(error instanceof Error ? error : new Error(failureMessage, { cause: error }));
  }
}
function planReviewOf(questions) {
  if (questions.length !== 1) return void 0;
  const question = questions[0];
  const intent = question.intent;
  if (intent?.kind !== "plan-review" || question.detail === void 0) return void 0;
  if (question.multiSelect === true) return void 0;
  const options = question.options ?? [];
  if (options.length > 2) return void 0;
  const approve = options.find((option) => option.label === intent.approve);
  if (approve === void 0) return void 0;
  const decline = options.find((option) => option.label !== intent.approve);
  return {
    id: question.id,
    question: question.question,
    plan: question.detail,
    ...intent.callId === void 0 ? {} : { callId: intent.callId },
    approve,
    ...decline === void 0 ? {} : { decline }
  };
}
var unnamedQuestionPrefix = Array.from(
  globalThis.crypto.getRandomValues(new Uint8Array(16)),
  (byte) => byte.toString(16).padStart(2, "0")
).join("");
var nextQuestionKey = 0;
var rejectionMessages = {
  ASK_ABORTED: "ask_user_question was aborted before the user answered",
  ASK_CANCELLED: "the user cancelled ask_user_question",
  ASK_TIMED_OUT: "ask_user_question timed out before the user answered"
};
function questionError(code) {
  const error = new Error(rejectionMessages[code]);
  error.name = "UserQuestionError";
  error.code = code;
  return error;
}
function createWaterfallRequest(deadline, signal, onSettle) {
  const completion = Promise.withResolvers();
  const delegated = Symbol("pending question delegated");
  let settled = false;
  const finish = (settle) => {
    if (settled) return;
    settled = true;
    signal?.removeEventListener("abort", onAbort);
    settle();
    onSettle(channel);
  };
  const onAbort = () => {
    finish(() => {
      completion.reject(questionError("ASK_ABORTED"));
    });
  };
  const channel = {
    deadline,
    resolve: (answer) => {
      finish(() => {
        completion.resolve(answer);
      });
    },
    reject: (code) => {
      finish(() => {
        completion.reject(questionError(code));
      });
    },
    delegate: () => {
      finish(() => {
        completion.reject(delegated);
      });
    }
  };
  if (signal !== void 0) {
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  }
  return { channel, result: completion.promise, isDelegation: (reason) => reason === delegated };
}
var PendingQuestion = class _PendingQuestion {
  /** Presentation discriminator used by Session pending-interaction consumers. */
  kind;
  /** Render identity and request key for the Session-scoped draft store. */
  key;
  /** Agent/Session identity owning the request. */
  sessionId;
  /** The request's question list. */
  questions;
  /** Tool call identity; absent for a blocking request that carried no `wait`. */
  callId;
  /**
   * Recorded answers of a call that already settled. Present only on a
   * read-only review card, which the tool call row builds from its own
   * transcript so a finished question can be read back in the panel that
   * asked it. Such a card has no answer channel and no countdown.
   */
  review;
  /**
   * What closing the panel does. A card keyed by tool call stays reachable
   * from its tool call row, so closing only withdraws the panel (`hide`) and
   * persists nothing. A card the Host never named has no way back, so closing
   * it ends the request (`cancel`).
   */
  dismissal;
  #state = "open";
  #waterfall;
  #rpc;
  #seat;
  #timedWait = false;
  #timer;
  #deadline;
  #remainingMs;
  #focused = false;
  #engaged = false;
  #held = false;
  #closed = false;
  #siblings;
  #listeners = /* @__PURE__ */ new Set();
  #snapshot;
  #requiresDecision;
  #waitMs;
  #timeoutMode = "native";
  #defaultAnswer;
  /**
   * @param sessionId - Agent/Session identity owning the request.
   * @param questions - complete question batch.
   * @param callId - tool call identity when the Host named one.
   * @param siblings - keys of every card currently registered for the Session, for draft pruning.
   * @param review - recorded answers of a settled call, making this a read-only card.
   */
  constructor(sessionId, questions, callId, siblings, review, settings) {
    this.sessionId = sessionId;
    this.questions = questions;
    this.#requiresDecision = questions.some((question) => question.intent?.kind === "plan-review" || question.intent?.kind === "approval");
    this.#waitMs = settings?.waitMs;
    this.#timeoutMode = settings?.timeoutMode ?? "native";
    this.#defaultAnswer = settings?.defaultAnswer;
    this.kind = planReviewOf(questions) === void 0 ? "question" : "plan-review";
    this.callId = callId;
    this.review = review;
    this.dismissal = callId === void 0 ? "cancel" : "hide";
    this.#siblings = siblings;
    if (callId === void 0) nextQuestionKey += 1;
    this.key = callId === void 0 ? `question:${unnamedQuestionPrefix}:${String(nextQuestionKey)}` : _PendingQuestion.keyOf(sessionId, callId);
    this.#snapshot = this.createSnapshot();
  }
  /**
   * Card key of a tool call, shared by every source that names one. The Host
   * request and the Session projection carry the branded `ToolCallId`; a
   * transcript row carries the same wire value as a plain string.
   * @param sessionId - owning Session.
   * @param callId - tool call identity, branded or as a transcript spells it.
   * @returns the render identity and draft key.
   */
  static keyOf(sessionId, callId) {
    return `question:${String(sessionId)}:${callId}`;
  }
  /**
   * Draft keys that are still live in this Session, this card included.
   * @returns keys the draft store must keep; everything else is stale.
   */
  liveKeys() {
    return this.#siblings?.() ?? [this.key];
  }
  /** Subscribe to card state changes. */
  subscribe = (listener) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };
  /** Apply timing policy when the forwarded request arrives after its projection created the card. */
  configure(settings) {
    this.#waitMs = settings.waitMs;
    this.#timeoutMode = settings.timeoutMode ?? "native";
    this.#defaultAnswer = settings.defaultAnswer;
    this.publish();
  }
  /** Read the stable current card state. */
  snapshot = () => this.#snapshot;
  /** Observable snapshot read by the renderer's keyed Hook. */
  getSnapshot = this.snapshot;
  createSnapshot() {
    const channel = this.#waterfall !== void 0 ? "waterfall" : this.#state === "continued" && this.#rpc !== void 0 ? "rpc" : "none";
    const waitState = this.#state === "continued" ? "continued" : this.#held ? "waiting" : this.#engaged ? "editing" : this.#focused ? "focused" : "counting";
    return {
      state: this.#state,
      waitState,
      countdown: this.#timedWait ? {
        remainingMs: this.#deadline === void 0 ? this.#remainingMs ?? 0 : Math.max(0, this.#deadline - Date.now()),
        running: this.#deadline !== void 0
      } : void 0,
      channel,
      closed: this.#closed,
      ...this.#timedWait ? { waitMs: this.#waitMs, timeoutMode: this.#timeoutMode } : {}
    };
  }
  publish() {
    this.#snapshot = this.createSnapshot();
    this.#reschedule();
    for (const listener of this.#listeners) listener();
  }
  /**
   * Own the countdown here rather than in a mounted component: the panel can be
   * hidden and remounted while the request stands, and a timer that died with
   * the component would leave the tool call waiting past its deadline.
   */
  #reschedule() {
    const wanted = this.#deadline !== void 0 && !this.#closed;
    if (wanted === (this.#timer !== void 0)) return;
    if (!wanted) {
      clearInterval(this.#timer);
      this.#timer = void 0;
      return;
    }
    this.#timer = setInterval(() => {
      this.#tick();
    }, 1e3);
  }
  #tick() {
    const deadline = this.#deadline;
    if (deadline === void 0) return;
    if (Date.now() >= deadline) {
      this.timeout();
      return;
    }
    this.publish();
  }
  /**
   * Attach the live waterfall of a forwarded request.
   * @param channel - request channel created by {@link createWaterfallRequest}.
   */
  attachWaterfall(channel) {
    this.#waterfall = channel;
    const deadline = this.#requiresDecision ? void 0 : channel.deadline;
    this.#timedWait = deadline !== void 0;
    if (!this.#held && !this.#engaged) {
      this.#deadline = deadline;
      if (this.#focused && deadline !== void 0) {
        this.#remainingMs = Math.max(0, deadline - Date.now());
        this.#deadline = void 0;
      }
    }
    this.publish();
  }
  /**
   * Drop a waterfall channel that settled or was cancelled; the card stays.
   * @param channel - the channel that ended.
   */
  detachWaterfall(channel) {
    if (this.#waterfall !== channel) return;
    this.#waterfall = void 0;
    this.#timedWait = false;
    this.#deadline = void 0;
    this.publish();
  }
  /**
   * Whether a live waterfall is attached.
   * @returns whether the pending Host request still accepts settlement.
   */
  hasWaterfall() {
    return this.#waterfall !== void 0;
  }
  /**
   * Attach the Remote answer path used once the question is continued.
   * @param channel - Remote calls bound to this Session and call.
   */
  attachRpc(channel) {
    this.#rpc = channel;
    this.publish();
  }
  /**
   * Attach the composer seat this card is published into.
   * @param seat - withdrawal of the published panel, owned by the card registry.
   */
  attachSeat(seat) {
    this.#seat = seat;
  }
  /**
   * Copy the projection row state.
   * @param state - `open` or `continued`.
   */
  setState(state) {
    if (this.#state === state) return;
    this.#state = state;
    this.publish();
  }
  /** Stop this Client's countdown indefinitely; the waterfall then waits like a blocking question. */
  takeTime() {
    if (this.#held) return;
    this.#held = true;
    this.#focused = false;
    this.#remainingMs = void 0;
    this.#deadline = void 0;
    this.publish();
  }
  /**
   * Record focus even before the request arrives, freezing a pristine countdown once attached.
   * @param now - current Client epoch time.
   */
  holdFocus(now = Date.now()) {
    if (this.#held || this.#engaged || this.#focused) return;
    this.#remainingMs = this.#deadline === void 0 ? void 0 : Math.max(0, this.#deadline - now);
    this.#deadline = void 0;
    this.#focused = true;
    this.publish();
  }
  /**
   * Resume a pristine countdown after the answer surface loses focus.
   * @param now - current Client epoch time.
   */
  releaseFocus(now = Date.now()) {
    if (!this.#focused) return;
    this.#focused = false;
    this.#deadline = this.#timedWait && this.#remainingMs !== void 0 ? now + this.#remainingMs : void 0;
    this.#remainingMs = void 0;
    this.publish();
  }
  /**
   * Keep the first edited draft answerable without a foreground deadline.
   * @param now - current Client epoch time used to preserve the remaining duration.
   */
  engage(now = Date.now()) {
    if (this.#held || this.#engaged) return;
    if (this.#remainingMs === void 0 && this.#deadline !== void 0) {
      this.#remainingMs = Math.max(0, this.#deadline - now);
    }
    this.#engaged = true;
    this.#focused = false;
    this.#deadline = void 0;
    this.publish();
  }
  /**
   * Extend the foreground countdown to the configured window. Called on every
   * real answer input (option click, text edit, page navigation, skip).
   * @param now - current Client epoch time.
   */
  bump(now = Date.now()) {
    if (this.#waitMs === void 0 || !this.#timedWait || this.#held) return;
    if (this.#waterfall === void 0 || this.#closed) return;
    this.#focused = false;
    this.#engaged = false;
    this.#remainingMs = void 0;
    this.#deadline = now + this.#waitMs;
    this.publish();
  }
  /** Settle with the host-authored default answer in default timeout mode. */
  autoSelect() {
    if (this.#requiresDecision) return;
    if (this.#held || this.#engaged || this.#focused) return;
    const channel = this.#waterfall;
    if (channel === void 0) return;
    const answer = this.#defaultAnswer;
    if (this.#timeoutMode !== "default" || answer === void 0) {
      this.timeout();
      return;
    }
    this.#waterfall = void 0;
    this.#timedWait = false;
    this.#deadline = void 0;
    channel.resolve(answer);
    this.publish();
  }
  /** Local countdown reached zero: default-select or settle with `ASK_TIMED_OUT`. */
  timeout() {
    if (this.#requiresDecision) return;
    if (this.#held || this.#engaged || this.#focused) return;
    if (this.#timeoutMode === "default" && this.#defaultAnswer !== void 0) {
      this.autoSelect();
      return;
    }
    const channel = this.#waterfall;
    if (channel === void 0) return;
    this.#waterfall = void 0;
    this.#timedWait = false;
    this.#deadline = void 0;
    channel.reject("ASK_TIMED_OUT");
    this.publish();
  }
  /** Hand a live waterfall to the next listener when this presentation domain unloads. */
  delegate() {
    this.#waterfall?.delegate();
  }
  /** Mark the card removed from the registry; the mounted composer clears its draft. */
  close() {
    if (this.#closed) return;
    this.#closed = true;
    this.publish();
  }
  /**
   * Submit the whole answer batch through the live waterfall, or through the
   * Remote path once the question is continued.
   * @param answer - complete structured answer batch.
   */
  answer(answer) {
    const waterfall = this.#waterfall;
    if (waterfall !== void 0) {
      return settlePendingComposer(() => {
        waterfall.resolve(answer);
      }, "pending question settlement failed");
    }
    const rpc = this.#rpc;
    if (this.#state === "continued" && rpc !== void 0) {
      return rpc.answer(answer).then((accepted) => {
        if (!accepted) throw new Error("this question is no longer answerable");
      });
    }
    return Promise.reject(new Error("no channel accepts an answer yet"));
  }
  /**
   * Close the panel. A tool-call-keyed card only leaves the composer seat: the
   * request stands, the countdown keeps running here, and the tool call row
   * reopens it. A card the Host never named ends its request instead, because
   * nothing could bring it back.
   */
  dismiss() {
    if (this.dismissal === "hide") {
      return settlePendingComposer(() => {
        this.#seat?.hide();
      }, "pending question hide failed");
    }
    const waterfall = this.#waterfall;
    if (waterfall === void 0) return Promise.reject(new Error("no channel accepts a cancellation yet"));
    return settlePendingComposer(() => {
      waterfall.reject("ASK_CANCELLED");
    }, "pending question cancellation failed");
  }
};

// src/client/draft-store.ts
var import_dsh_client_store = require("@deepseek-ai/dsh-client-store");
function createQuestionDraftStore() {
  return (0, import_dsh_client_store.defineStore)({
    init: () => ({ progressByRequest: {} }),
    persist: "dsh.user-questions.drafts.v1",
    actions: {
      replace: (draft, requestKey, progress) => {
        draft.progressByRequest[requestKey] = progress;
      },
      clear: (draft, requestKey) => {
        draft.progressByRequest = Object.fromEntries(
          Object.entries(draft.progressByRequest).filter(([key]) => key !== requestKey)
        );
      },
      prune: (draft, keep) => {
        const live = new Set(keep);
        draft.progressByRequest = Object.fromEntries(
          Object.entries(draft.progressByRequest).filter(([key]) => live.has(key))
        );
      }
    }
  });
}

// src/client/AskHistoryRow.tsx
var import_react = require("react");
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/AskHistoryRow.module.css
var css = "/* src/client/AskHistoryRow.module.css */\n.AskHistoryRow_frame {\n  --cfg-line: var(--dsw-alias-border-l2);\n  --cfg-ink: var(--dsw-alias-label-primary);\n  --cfg-muted: var(--dsw-alias-label-secondary);\n  --cfg-accent: var(--dsw-alias-state-business-primary, #3388bb);\n  --cfg-accent-text: color-mix(in srgb, var(--cfg-accent) 70%, var(--cfg-ink));\n  --cfg-hover: var(--dsw-alias-interactive-bg-hover);\n  min-width: 0;\n}\n.AskHistoryRow_row {\n  appearance: none;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  width: 100%;\n  min-height: 32px;\n  min-width: 0;\n  padding: 4px 8px;\n  border: 0;\n  border-radius: 8px;\n  background: transparent;\n  color: var(--cfg-muted);\n  font: inherit;\n  line-height: 20px;\n  text-align: left;\n}\nbutton.AskHistoryRow_row {\n  cursor: pointer;\n}\nbutton.AskHistoryRow_row:hover {\n  background: var(--cfg-hover);\n  color: var(--cfg-ink);\n}\nbutton.AskHistoryRow_row:active {\n  background: color-mix(in srgb, var(--cfg-accent) 9%, transparent);\n}\nbutton.AskHistoryRow_row:focus-visible {\n  outline: 2px solid var(--cfg-accent);\n  outline-offset: -2px;\n}\n.AskHistoryRow_icon {\n  display: inline-flex;\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n}\n.AskHistoryRow_icon svg {\n  width: 14px;\n  height: 14px;\n}\n.AskHistoryRow_summary {\n  min-width: 0;\n  flex: 1;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.AskHistoryRow_open {\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  flex: none;\n  color: var(--cfg-muted);\n  font-size: 12px;\n}\n.AskHistoryRow_state {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 12px;\n}\n.AskHistoryRow_error {\n  display: block;\n  padding: 4px 8px 4px 30px;\n  color: var(--dsw-alias-state-error-primary);\n  font-size: 12px;\n  line-height: 18px;\n  overflow-wrap: anywhere;\n}\n@media (max-width: 640px) {\n  .AskHistoryRow_row {\n    min-height: 44px;\n    align-items: flex-start;\n    padding-block: 10px;\n  }\n  .AskHistoryRow_summary {\n    white-space: normal;\n    overflow-wrap: anywhere;\n  }\n  .AskHistoryRow_open {\n    align-self: center;\n  }\n}\n@media (pointer: coarse) {\n  .AskHistoryRow_row {\n    min-height: 44px;\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  button.AskHistoryRow_row {\n    transition: none;\n  }\n}\n[data-ds-dark-theme] .AskHistoryRow_frame {\n  --cfg-accent: var(--dsw-alias-state-business-primary, #4eb0e8);\n  --cfg-accent-text: color-mix(in srgb, var(--cfg-accent) 70%, var(--cfg-ink));\n}\n";
var id = "dsh-better-ask-user/AskHistoryRow.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(id) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-better-ask-user";
  tag.dataset.pluginCss = id;
  tag.textContent = css;
  document.head.appendChild(tag);
}
var AskHistoryRow_default = {
  frame: "AskHistoryRow_frame",
  row: "AskHistoryRow_row",
  icon: "AskHistoryRow_icon",
  summary: "AskHistoryRow_summary",
  open: "AskHistoryRow_open",
  state: "AskHistoryRow_state",
  error: "AskHistoryRow_error"
};
var css_modules_entry_default = AskHistoryRow_default;

// src/client/AskHistoryRow.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return void 0;
  }
}
function resultText(content) {
  const parts = [];
  for (const block of content) {
    if (!isRecord(block) || block.type !== "text" || typeof block.text !== "string") continue;
    parts.push(block.text);
  }
  return parts.length === 0 ? void 0 : parts.join("\n");
}
function questionList(argsRaw) {
  const parsed = parseJson(argsRaw);
  if (!isRecord(parsed) || !Array.isArray(parsed.questions) || parsed.questions.length === 0) return void 0;
  const questions = [];
  for (const candidate of parsed.questions) {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || typeof candidate.question !== "string") return void 0;
    questions.push({
      id: candidate.id,
      question: candidate.question,
      ...typeof candidate.header === "string" ? { header: candidate.header } : {},
      ...typeof candidate.detail === "string" ? { detail: candidate.detail } : {},
      ...Array.isArray(candidate.options) ? {
        options: candidate.options.flatMap((option) => isRecord(option) && typeof option.label === "string" ? [{
          label: option.label,
          ...typeof option.description === "string" ? { description: option.description } : {}
        }] : [])
      } : {},
      ...typeof candidate.multi_select === "boolean" ? { multiSelect: candidate.multi_select } : {}
    });
  }
  return questions;
}
function answerList(text) {
  if (text === void 0) return void 0;
  const parsed = parseJson(text);
  if (!isRecord(parsed) || !Array.isArray(parsed.answers)) return void 0;
  const answers = [];
  for (const candidate of parsed.answers) {
    if (!isRecord(candidate) || typeof candidate.id !== "string" || !Array.isArray(candidate.selected) || !candidate.selected.every((value) => typeof value === "string") || candidate.custom !== void 0 && typeof candidate.custom !== "string") return void 0;
    answers.push({
      id: candidate.id,
      selected: candidate.selected,
      ...candidate.custom === void 0 ? {} : { custom: candidate.custom }
    });
  }
  return answers;
}
function AskHistoryRow({
  callId,
  block,
  phase,
  useProjection,
  useQuestionPanelLive,
  revealPanel,
  reviewPanel,
  t
}) {
  const [failedAction, setFailedAction] = (0, import_react.useState)(null);
  const argsRaw = "kind" in block ? block.call?.argsRaw ?? "" : "argsRaw" in block ? block.argsRaw : "";
  const output = "kind" in block ? resultText(block.content) : void 0;
  const questions = questionList(argsRaw);
  const settled = useProjection("userQuestions", (view) => view?.settled.find((row) => row.callId === callId));
  const answers = settled?.answers ?? answerList(output) ?? [];
  const record = questions !== void 0 && phase === "result" ? { questions, answers } : void 0;
  const live = useQuestionPanelLive(callId, (present) => present === true);
  const errorCode = "kind" in block ? block.error?.code : void 0;
  const status = live ? void 0 : errorCode === "ASK_ABORTED" || errorCode === "interrupted" ? t("history.interrupted") : errorCode === "ASK_CANCELLED" ? t("history.cancelled") : void 0;
  const summary = questions?.[0]?.question.split("\n").find((line) => line.trim() !== "")?.trim() ?? t("history.title");
  const action = live ? () => revealPanel(callId) : record === void 0 ? void 0 : () => reviewPanel(callId, record);
  const review = !live && record !== void 0;
  const actionKey = `${callId}-${review ? "review" : "open"}`;
  const actionLabel = review ? t("history.review") : t("history.reopen");
  const trailing = action === void 0 ? status === void 0 ? null : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: css_modules_entry_default.state, children: status }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: css_modules_entry_default.open, children: [
    status !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: css_modules_entry_default.state, children: status }),
    actionLabel,
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconChevronRightOutlineRegular, { size: 14 })
  ] });
  const content = /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: css_modules_entry_default.icon, "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_dsh_client_ui_primitives.IconQuestionOutlineRegular, {}) }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: css_modules_entry_default.summary, title: summary, children: summary }),
    trailing
  ] });
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: css_modules_entry_default.frame, role: "group", "aria-label": t("history.title"), children: [
    action === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: css_modules_entry_default.row, "data-question-history": callId, children: content }) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        className: css_modules_entry_default.row,
        "data-question-history": callId,
        "data-history-action": review ? "review" : "open",
        onClick: () => {
          setFailedAction(action() ? null : actionKey);
        },
        "aria-label": `${actionLabel}${status === void 0 ? "" : ` \xB7 ${status}`} \xB7 ${summary}`,
        children: content
      }
    ),
    failedAction === actionKey && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: css_modules_entry_default.error, role: "alert", children: t("history.unavailable") })
  ] });
}

// src/client/QuestionComposer.tsx
var import_react4 = require("react");

// ../../node_modules/.pnpm/clsx@2.1.1/node_modules/clsx/dist/clsx.mjs
function r(e) {
  var t, f, n = "";
  if ("string" == typeof e || "number" == typeof e) n += e;
  else if ("object" == typeof e) if (Array.isArray(e)) {
    var o = e.length;
    for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
  } else for (f in e) e[f] && (n && (n += " "), n += f);
  return n;
}
function clsx() {
  for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
  return n;
}
var clsx_default = clsx;

// src/client/QuestionComposer.tsx
var import_dsh_client_ui_primitives3 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/PlanReviewPanel.tsx
var import_react3 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/QuestionWaitBar.tsx
var import_react2 = require("react");

// src/client/QuestionWaitBar.module.css
var css2 = '/* src/client/QuestionWaitBar.module.css */\n.QuestionWaitBar_bar {\n  --cfg-accent: var(--dsw-alias-state-business-primary, #3388bb);\n  --cfg-accent-text: color-mix(in srgb, var(--cfg-accent) 70%, var(--cfg-ink));\n  --cfg-line: var(--dsw-alias-border-l2);\n  --cfg-ink: var(--dsw-alias-label-primary);\n  --cfg-muted: var(--dsw-alias-label-secondary);\n  --cfg-surface: var(--dsw-alias-bg-layer-2);\n  --cfg-hover: var(--dsw-alias-interactive-bg-hover);\n  display: flex;\n  align-items: center;\n  flex-shrink: 0;\n  gap: 8px;\n  min-height: 32px;\n  margin: 0 16px 10px;\n  padding: 2px 4px 2px 8px;\n  border: 1px solid var(--cfg-line);\n  border-radius: 8px;\n  background: var(--cfg-surface);\n  color: var(--cfg-ink);\n}\n.QuestionWaitBar_clock {\n  position: relative;\n  display: grid;\n  place-items: center;\n  width: 24px;\n  height: 24px;\n  flex: none;\n}\n.QuestionWaitBar_ring {\n  position: absolute;\n  inset: 0;\n  width: 100%;\n  height: 100%;\n  fill: none;\n  stroke-width: 2;\n  transform: rotate(-90deg);\n}\n.QuestionWaitBar_track {\n  stroke: var(--cfg-line);\n}\n.QuestionWaitBar_remaining {\n  stroke: var(--cfg-accent);\n}\n.QuestionWaitBar_clockHand {\n  width: 8px;\n  height: 9px;\n  margin-top: -4px;\n  margin-left: 5px;\n  border-left: 1px solid var(--cfg-muted);\n  border-bottom: 1px solid var(--cfg-muted);\n}\n.QuestionWaitBar_pause {\n  width: 16px;\n  height: 16px;\n  color: var(--cfg-muted);\n}\n.QuestionWaitBar_status {\n  display: flex;\n  align-items: baseline;\n  flex-wrap: wrap;\n  flex: 1;\n  gap: 0 8px;\n  min-width: 0;\n}\n.QuestionWaitBar_status > * + *::before {\n  content: "\\b7";\n  margin-right: 8px;\n  color: var(--cfg-muted);\n}\n.QuestionWaitBar_time {\n  font-size: 12px;\n  line-height: 20px;\n  font-variant-numeric: tabular-nums;\n  overflow-wrap: anywhere;\n}\n.QuestionWaitBar_bar[data-wait-state=counting] .QuestionWaitBar_time,\n.QuestionWaitBar_bar[data-wait-state=paused] .QuestionWaitBar_time {\n  font-size: 13px;\n  font-weight: 500;\n  font-variant-numeric: tabular-nums;\n}\n.QuestionWaitBar_policy {\n  color: var(--cfg-muted);\n  font-size: 12px;\n  line-height: 20px;\n}\n.QuestionWaitBar_takeTime {\n  appearance: none;\n  flex: none;\n  margin-left: auto;\n  min-height: 32px;\n  padding: 0 8px;\n  border: 0;\n  border-radius: 8px;\n  background: transparent;\n  color: var(--cfg-muted);\n  font: inherit;\n  font-size: 12px;\n  cursor: pointer;\n}\n.QuestionWaitBar_takeTime:hover:not(:disabled) {\n  background: var(--cfg-hover);\n  color: var(--cfg-ink);\n}\n.QuestionWaitBar_takeTime:active:not(:disabled) {\n  background: color-mix(in srgb, var(--cfg-accent) 10%, transparent);\n}\n.QuestionWaitBar_takeTime:focus-visible {\n  outline: 2px solid var(--cfg-accent);\n  outline-offset: 2px;\n}\n.QuestionWaitBar_takeTime:disabled {\n  opacity: .4;\n  cursor: default;\n}\n@media (max-width: 720px) {\n  .QuestionWaitBar_bar {\n    gap: 8px;\n    margin: 0 16px 10px;\n    padding: 4px 8px;\n  }\n  .QuestionWaitBar_status {\n    display: grid;\n    gap: 2px;\n  }\n  .QuestionWaitBar_status > * + *::before {\n    content: none;\n  }\n  .QuestionWaitBar_time {\n    font-size: 16px;\n    line-height: 24px;\n  }\n  .QuestionWaitBar_takeTime {\n    min-height: 44px;\n  }\n}\n@media (pointer: coarse) {\n  .QuestionWaitBar_takeTime {\n    min-height: 44px;\n  }\n}\n[data-ds-dark-theme] .QuestionWaitBar_bar {\n  --cfg-accent: var(--dsw-alias-state-business-primary, #4eb0e8);\n  --cfg-accent-text: color-mix(in srgb, var(--cfg-accent) 70%, var(--cfg-ink));\n}\n';
var id2 = "dsh-better-ask-user/QuestionWaitBar.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(id2) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-better-ask-user";
  tag.dataset.pluginCss = id2;
  tag.textContent = css2;
  document.head.appendChild(tag);
}
var QuestionWaitBar_default = {
  bar: "QuestionWaitBar_bar",
  clock: "QuestionWaitBar_clock",
  ring: "QuestionWaitBar_ring",
  track: "QuestionWaitBar_track",
  remaining: "QuestionWaitBar_remaining",
  clockHand: "QuestionWaitBar_clockHand",
  pause: "QuestionWaitBar_pause",
  status: "QuestionWaitBar_status",
  time: "QuestionWaitBar_time",
  policy: "QuestionWaitBar_policy",
  takeTime: "QuestionWaitBar_takeTime"
};
var css_modules_entry_default2 = QuestionWaitBar_default;

// src/client/QuestionWaitBar.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
function QuestionWaitBar({ card, t, busy, onTakeTime }) {
  const countdown = card?.countdown;
  const initialWindow = (0, import_react2.useRef)(countdown?.remainingMs);
  if (card === void 0 || countdown === void 0 && card.state !== "continued") return null;
  const continued = card.state === "continued";
  const held = card.waitState === "waiting" || card.waitState === "editing";
  const running = !held && !continued && countdown?.running === true;
  const seconds = Math.max(0, Math.ceil((countdown?.remainingMs ?? 0) / 1e3));
  const duration = card.waitMs ?? initialWindow.current;
  const fraction = duration === void 0 || duration <= 0 ? void 0 : Math.min(1, Math.max(0, (countdown?.remainingMs ?? 0) / duration));
  const status = continued ? t("wait.continued") : held ? t("wait.held") : t(!running ? "wait.paused" : card.timeoutMode === "default" ? "wait.autoCountdown" : "wait.countdown", { seconds });
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: css_modules_entry_default2.bar, "data-question-wait": true, "data-wait-state": continued ? "continued" : held ? "held" : running ? "counting" : "paused", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { className: css_modules_entry_default2.clock, "aria-hidden": "true", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { viewBox: "0 0 32 32", className: css_modules_entry_default2.ring, children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { className: css_modules_entry_default2.track, cx: "16", cy: "16", r: "13" }),
        !held && !continued && fraction !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { className: css_modules_entry_default2.remaining, cx: "16", cy: "16", r: "13", pathLength: "100", strokeDasharray: "100", strokeDashoffset: 100 * (1 - fraction) })
      ] }),
      !running ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("svg", { className: css_modules_entry_default2.pause, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: "1.5", children: continued ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "m3 8 3 3 7-7" }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("path", { d: "M6 4v8M10 4v8" }) }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: css_modules_entry_default2.clockHand })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { className: css_modules_entry_default2.status, role: held || continued ? "status" : void 0, "aria-atomic": "true", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: css_modules_entry_default2.time, "aria-label": status, children: held || continued ? status : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` }),
      !held && !continued && !running && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: css_modules_entry_default2.policy, children: t("wait.pauseLabel") }),
      !held && !continued && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { className: css_modules_entry_default2.policy, children: t(card.timeoutMode === "default" ? "wait.auto" : "wait.extend") })
    ] }),
    !held && !continued && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("button", { type: "button", className: css_modules_entry_default2.takeTime, disabled: busy, onClick: onTakeTime, children: t("wait.takeTime") })
  ] });
}

// src/client/PlanReviewPanel.module.css
var css3 = "/* src/client/PlanReviewPanel.module.css */\n.PlanReviewPanel_frame {\n  --cfg-line: var(--dsw-alias-border-l2);\n  --cfg-surface: var(--dsw-alias-bg-layer-3);\n  --cfg-ink: var(--dsw-alias-label-primary);\n  --cfg-muted: var(--dsw-alias-label-secondary);\n  --cfg-accent: var(--dsw-alias-state-business-primary, #3388bb);\n  --cfg-accent-text: color-mix(in srgb, var(--cfg-accent) 70%, var(--cfg-ink));\n  --cfg-hover: var(--dsw-alias-interactive-bg-hover);\n  --cfg-danger: var(--dsw-alias-state-error-primary);\n  --cfg-solid: var(--dsw-alias-button-primary-fill, #20709e);\n  --cfg-solid-hover: color-mix(in srgb, var(--cfg-solid) 88%, var(--cfg-on-solid));\n  --cfg-on-solid: var(--dsw-alias-label-primary-foreground, #fff);\n  display: flex;\n  justify-content: center;\n  width: 100%;\n  min-width: 0;\n  box-sizing: border-box;\n  padding: 6px calc(var(--dsh-composer-side-clearance, 0px) + 16px) calc(10px + env(safe-area-inset-bottom));\n}\n.PlanReviewPanel_card {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  min-width: 0;\n  max-width: var(--dsh-chat-content-width);\n  max-height: min(75vh, 640px);\n  max-height: min(75dvh, 640px);\n  overflow: hidden;\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: 10px;\n  background: var(--cfg-surface);\n  color: var(--cfg-ink);\n  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);\n  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);\n}\n.PlanReviewPanel_card,\n.PlanReviewPanel_card * {\n  box-sizing: border-box;\n}\n.PlanReviewPanel_strip {\n  display: flex;\n  align-items: center;\n  flex-shrink: 0;\n  flex-wrap: wrap;\n  gap: 8px;\n  min-width: 0;\n  padding: 6px 12px;\n  border-bottom: 1px solid var(--cfg-line);\n}\n.PlanReviewPanel_panelLabel {\n  color: var(--cfg-muted);\n  font-size: 12px;\n  font-weight: 500;\n  line-height: 20px;\n}\n.PlanReviewPanel_previewActions {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 4px;\n  min-width: 0;\n  margin-left: auto;\n}\n.PlanReviewPanel_summary {\n  min-width: 0;\n  min-height: 0;\n  overflow-y: auto;\n  overscroll-behavior: contain;\n  scrollbar-gutter: stable;\n  padding: 10px 12px;\n}\n.PlanReviewPanel_documentHeading {\n  display: flex;\n  align-items: flex-start;\n  gap: 8px;\n}\n.PlanReviewPanel_documentIcon {\n  flex: none;\n  width: 18px;\n  height: 20px;\n  color: var(--dsw-alias-label-tertiary);\n}\n.PlanReviewPanel_title,\n.PlanReviewPanel_description {\n  min-width: 0;\n  overflow-wrap: anywhere;\n  word-break: break-word;\n}\n.PlanReviewPanel_title {\n  margin: 0;\n  font-size: 14px;\n  font-weight: 500;\n  line-height: 20px;\n}\n.PlanReviewPanel_description {\n  display: -webkit-box;\n  -webkit-box-orient: vertical;\n  -webkit-line-clamp: 2;\n  overflow: hidden;\n  margin: 4px 0 0;\n  color: var(--cfg-muted);\n  font-size: inherit;\n  line-height: 20px;\n}\n.PlanReviewPanel_footer {\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  flex-shrink: 0;\n  flex-wrap: wrap;\n  gap: 8px 12px;\n  padding: 8px 12px;\n  border-top: 1px solid var(--cfg-line);\n}\n.PlanReviewPanel_feedback {\n  flex: 1;\n  min-width: 0;\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  color: var(--cfg-muted);\n  font-size: 12px;\n  line-height: 18px;\n  overflow-wrap: anywhere;\n}\n.PlanReviewPanel_feedback[data-error] {\n  color: var(--cfg-danger);\n}\n.PlanReviewPanel_discuss,\n.PlanReviewPanel_primary,\n.PlanReviewPanel_decline {\n  appearance: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-height: 32px;\n  padding: 0 10px;\n  border: 1px solid var(--cfg-line);\n  border-radius: 8px;\n  background: transparent;\n  color: var(--cfg-ink);\n  box-shadow: none;\n  font: inherit;\n  font-size: 13px;\n  font-weight: 500;\n  cursor: pointer;\n}\n.PlanReviewPanel_discuss:hover:not(:disabled) {\n  background: var(--cfg-hover);\n}\n.PlanReviewPanel_primary {\n  border-color: transparent;\n  background: var(--cfg-solid);\n  color: var(--cfg-on-solid);\n}\n.PlanReviewPanel_primary:hover:not(:disabled) {\n  background: var(--cfg-solid-hover);\n}\n.PlanReviewPanel_spinner {\n  flex: none;\n  width: 12px;\n  height: 12px;\n  border: 1px solid currentColor;\n  border-right-color: transparent;\n  border-radius: 50%;\n  animation: PlanReviewPanel_spin 800ms linear infinite;\n}\n@keyframes PlanReviewPanel_spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n.PlanReviewPanel_feedback:empty {\n  display: none;\n}\n.PlanReviewPanel_actions {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 8px;\n}\n.PlanReviewPanel_decline {\n  min-height: 32px;\n  padding: 0 10px;\n  border: 0;\n  border-radius: 8px;\n  background: transparent;\n  color: var(--cfg-muted);\n  font: inherit;\n  font-size: inherit;\n  line-height: 20px;\n  cursor: pointer;\n}\n.PlanReviewPanel_decline:hover:not(:disabled),\n.PlanReviewPanel_decline:active:not(:disabled) {\n  background: var(--cfg-hover);\n  color: var(--cfg-ink);\n}\n.PlanReviewPanel_discuss {\n  gap: 6px;\n}\n.PlanReviewPanel_card button:focus-visible {\n  outline: 2px solid var(--cfg-accent);\n  outline-offset: -2px;\n}\n.PlanReviewPanel_card button:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n.PlanReviewPanel_srOnly {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  overflow: hidden;\n  padding: 0;\n  border: 0;\n  clip-path: inset(50%);\n  white-space: nowrap;\n}\n@media (max-width: 720px) {\n  .PlanReviewPanel_card {\n    max-height: calc(100vh - 160px);\n    max-height: calc(100dvh - 160px);\n  }\n  .PlanReviewPanel_frame {\n    padding-inline: 16px;\n  }\n  .PlanReviewPanel_card button {\n    min-height: 44px;\n  }\n  .PlanReviewPanel_strip {\n    padding: 6px 12px;\n  }\n  .PlanReviewPanel_summary {\n    padding: 10px 12px;\n  }\n  .PlanReviewPanel_footer {\n    padding: 8px 12px;\n  }\n  .PlanReviewPanel_feedback {\n    flex: 1 1 100%;\n  }\n}\n@media (max-width: 420px) {\n  .PlanReviewPanel_actions {\n    width: 100%;\n  }\n  .PlanReviewPanel_actions > button {\n    flex: 1;\n  }\n}\n@media (pointer: coarse) {\n  .PlanReviewPanel_card button {\n    min-height: 44px;\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .PlanReviewPanel_spinner {\n    animation: none;\n  }\n}\n[data-ds-dark-theme] .PlanReviewPanel_frame {\n  --cfg-accent: var(--dsw-alias-state-business-primary, #4eb0e8);\n  --cfg-accent-text: color-mix(in srgb, var(--cfg-accent) 70%, var(--cfg-ink));\n  --cfg-solid: var(--dsw-alias-button-primary-fill, #4eb0e8);\n  --cfg-solid-hover: color-mix(in srgb, var(--cfg-solid) 88%, var(--cfg-on-solid));\n  --cfg-on-solid: var(--dsw-alias-label-primary-foreground, #0e1014);\n}\n";
var id3 = "dsh-better-ask-user/PlanReviewPanel.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(id3) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-better-ask-user";
  tag.dataset.pluginCss = id3;
  tag.textContent = css3;
  document.head.appendChild(tag);
}
var PlanReviewPanel_default = {
  frame: "PlanReviewPanel_frame",
  card: "PlanReviewPanel_card",
  strip: "PlanReviewPanel_strip",
  panelLabel: "PlanReviewPanel_panelLabel",
  previewActions: "PlanReviewPanel_previewActions",
  summary: "PlanReviewPanel_summary",
  documentHeading: "PlanReviewPanel_documentHeading",
  documentIcon: "PlanReviewPanel_documentIcon",
  title: "PlanReviewPanel_title",
  description: "PlanReviewPanel_description",
  footer: "PlanReviewPanel_footer",
  feedback: "PlanReviewPanel_feedback",
  discuss: "PlanReviewPanel_discuss",
  primary: "PlanReviewPanel_primary",
  decline: "PlanReviewPanel_decline",
  spinner: "PlanReviewPanel_spinner",
  spin: "PlanReviewPanel_spin",
  actions: "PlanReviewPanel_actions",
  srOnly: "PlanReviewPanel_srOnly"
};
var css_modules_entry_default3 = PlanReviewPanel_default;

// src/client/PlanReviewPanel.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
function tooltip(description) {
  return description === void 0 ? {} : { title: description };
}
function PlanReviewPanel({ pending, review, t, renderSlot, useQuestionCard }) {
  const [busy, setBusy] = (0, import_react3.useState)(false);
  const [error, setError] = (0, import_react3.useState)(null);
  const card = useQuestionCard(pending.key, (snapshot) => snapshot);
  const canDecide = card !== void 0 && !card.closed && card.channel !== "none";
  const surface = (0, import_react3.useRef)(null);
  const sentVia = (0, import_react3.useRef)(null);
  (0, import_react3.useEffect)(() => {
    if (sentVia.current !== "waterfall" || card?.state !== "continued") return;
    sentVia.current = null;
    setBusy(false);
    setError(t("error.resubmit"));
  }, [card?.state, t]);
  (0, import_react3.useEffect)(() => {
    const release = () => {
      pending.releaseFocus();
    };
    const refocus = () => {
      if (surface.current?.contains(document.activeElement) === true) pending.holdFocus();
    };
    const visibilityChanged = () => {
      if (document.hidden) release();
      else refocus();
    };
    window.addEventListener("blur", release);
    window.addEventListener("focus", refocus);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      release();
      window.removeEventListener("blur", release);
      window.removeEventListener("focus", refocus);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [pending]);
  const settle = (send, remote = false) => {
    setBusy(true);
    setError(null);
    sentVia.current = pending.snapshot().channel === "waterfall" ? "waterfall" : null;
    void send().then(() => {
      if (!remote) return;
      setBusy(false);
      void pending.dismiss().catch(() => {
        setError(t("status.sent"));
      });
    }).catch((cause) => {
      sentVia.current = null;
      setBusy(false);
      setError(cause instanceof Error ? cause.message : String(cause));
    });
  };
  const decide = (label) => {
    settle(() => pending.answer({ answers: [{ id: review.id, selected: [label] }] }), pending.snapshot().channel === "rpc");
  };
  const decline = review.decline;
  const summary = (0, import_react3.useMemo)(() => {
    const title = (0, import_dsh_client_ui_primitives2.extractMarkdownPlainText)(review.plan, { mode: "first-line" });
    const description = (0, import_dsh_client_ui_primitives2.extractMarkdownPlainText)(review.plan, { mode: "first-paragraph" });
    return { title, description: description === title ? "" : description };
  }, [review.plan]);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: css_modules_entry_default3.frame, "data-plan-review-key": pending.key, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
    "section",
    {
      ref: surface,
      className: css_modules_entry_default3.card,
      "aria-label": review.question,
      "aria-busy": busy,
      onFocusCapture: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) pending.holdFocus();
      },
      onBlurCapture: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) pending.releaseFocus();
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: css_modules_entry_default3.strip, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: css_modules_entry_default3.panelLabel, children: t("plan.header") }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: css_modules_entry_default3.previewActions, children: renderSlot("conversation.plan-review.actions", { review, requestKey: pending.key }) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(QuestionWaitBar, { card, t, busy, onTakeTime: () => {
          pending.takeTime();
        } }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: css_modules_entry_default3.summary, "data-plan-document": true, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: css_modules_entry_default3.documentHeading, children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("svg", { className: css_modules_entry_default3.documentIcon, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("path", { d: "M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 12h6M9 16h6" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("h3", { className: css_modules_entry_default3.title, children: summary.title })
          ] }),
          summary.description !== "" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: css_modules_entry_default3.description, children: summary.description })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: css_modules_entry_default3.footer, "data-plan-decision": true, children: [
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: css_modules_entry_default3.feedback, role: error === null ? "status" : "alert", "aria-atomic": "true", "data-error": error !== null || void 0, children: [
            busy && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: css_modules_entry_default3.spinner, "aria-hidden": "true" }),
            error ?? (busy ? t("submitting") : null)
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: css_modules_entry_default3.actions, children: [
            decline !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "button",
              {
                type: "button",
                className: css_modules_entry_default3.decline,
                ...tooltip(decline.description),
                "aria-describedby": decline.description === void 0 ? void 0 : `plan-decline-${pending.key}`,
                disabled: busy || !canDecide,
                onClick: () => {
                  decide(decline.label);
                },
                children: decline.label
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              import_dsh_client_ui_primitives2.Button,
              {
                variant: "outline",
                className: css_modules_entry_default3.discuss,
                icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.IconEditOutlineRegular, { size: 14 }),
                disabled: busy,
                onClick: () => {
                  settle(() => pending.dismiss());
                },
                children: t("plan.discuss")
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              import_dsh_client_ui_primitives2.Button,
              {
                variant: "primary",
                className: css_modules_entry_default3.primary,
                ...tooltip(review.approve.description),
                "aria-describedby": review.approve.description === void 0 ? void 0 : `plan-approve-${pending.key}`,
                disabled: busy || !canDecide,
                onClick: () => {
                  decide(review.approve.label);
                },
                children: t("plan.approve")
              }
            )
          ] })
        ] }),
        decline?.description !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: css_modules_entry_default3.srOnly, id: `plan-decline-${pending.key}`, children: decline.description }),
        review.approve.description !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: css_modules_entry_default3.srOnly, id: `plan-approve-${pending.key}`, children: review.approve.description })
      ]
    }
  ) });
}

// src/client/QuestionComposer.module.css
var css4 = '/* src/client/QuestionComposer.module.css */\n.QuestionComposer_frame {\n  --cfg-line: var(--dsw-alias-border-l2);\n  --cfg-surface: var(--dsw-alias-bg-layer-3);\n  --cfg-ink: var(--dsw-alias-label-primary);\n  --cfg-muted: var(--dsw-alias-label-secondary);\n  --cfg-accent: var(--dsw-alias-state-business-primary, #3388bb);\n  --cfg-accent-text: color-mix(in srgb, var(--cfg-accent) 70%, var(--cfg-ink));\n  --cfg-hover: var(--dsw-alias-interactive-bg-hover);\n  --cfg-danger: var(--dsw-alias-state-error-primary);\n  --cfg-solid: var(--dsw-alias-button-primary-fill, #20709e);\n  --cfg-solid-hover: color-mix(in srgb, var(--cfg-solid) 88%, var(--cfg-on-solid));\n  --cfg-on-solid: var(--dsw-alias-label-primary-foreground, #fff);\n  display: flex;\n  justify-content: center;\n  width: 100%;\n  min-width: 0;\n  box-sizing: border-box;\n  padding: 6px calc(var(--dsh-composer-side-clearance, 0px) + 16px) calc(10px + env(safe-area-inset-bottom));\n}\n.QuestionComposer_card {\n  display: flex;\n  flex-direction: column;\n  width: 100%;\n  min-width: 0;\n  max-width: var(--dsh-chat-content-width);\n  max-height: min(75vh, 640px);\n  max-height: min(75dvh, 640px);\n  overflow: hidden;\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: 10px;\n  background: var(--cfg-surface);\n  color: var(--cfg-ink);\n  font-size: inherit;\n  --dsh-scrollbar-thumb: var(--dsw-alias-scrollbar-bg-l2);\n  --dsh-scrollbar-thumb-hover: var(--dsw-alias-scrollbar-hover-l2);\n}\n.QuestionComposer_card,\n.QuestionComposer_card * {\n  box-sizing: border-box;\n}\n.QuestionComposer_cardMinimized {\n  max-height: none;\n}\n.QuestionComposer_header {\n  display: flex;\n  align-items: flex-start;\n  justify-content: space-between;\n  flex-shrink: 0;\n  gap: 12px;\n  padding: 10px 12px 6px;\n}\n.QuestionComposer_headingBlock {\n  flex: 1;\n  min-width: 0;\n}\n.QuestionComposer_eyebrow {\n  margin-bottom: 2px;\n  color: var(--cfg-muted);\n  font-size: 11px;\n  line-height: 16px;\n}\n.QuestionComposer_title {\n  margin: 0;\n  max-height: 24vh;\n  max-height: 24dvh;\n  overflow-y: auto;\n  font-size: 14px;\n  line-height: 20px;\n  font-weight: 500;\n}\n.QuestionComposer_title,\n.QuestionComposer_eyebrow,\n.QuestionComposer_optionLabel,\n.QuestionComposer_description,\n.QuestionComposer_detail {\n  min-width: 0;\n  overflow-wrap: anywhere;\n  word-break: break-word;\n}\n.QuestionComposer_title > div,\n.QuestionComposer_eyebrow > div,\n.QuestionComposer_optionLabel > div,\n.QuestionComposer_description > div {\n  margin: 0;\n}\n.QuestionComposer_title > [data-markdown-variant=compact],\n.QuestionComposer_optionLabel > [data-markdown-variant=compact],\n.QuestionComposer_title > [data-markdown-variant=compact] > p,\n.QuestionComposer_optionLabel > [data-markdown-variant=compact] > p {\n  color: inherit;\n  font: inherit;\n}\n.QuestionComposer_headerActions,\n.QuestionComposer_footerActions,\n.QuestionComposer_pager {\n  display: flex;\n  align-items: center;\n  flex-shrink: 0;\n  gap: 4px;\n}\n.QuestionComposer_footerActions {\n  margin-left: auto;\n  gap: 8px;\n}\n.QuestionComposer_iconButton {\n  display: grid;\n  place-items: center;\n  width: 28px;\n  height: 28px;\n  padding: 0;\n  border: 0;\n  border-radius: 6px;\n  background: transparent;\n  color: var(--cfg-muted);\n  cursor: pointer;\n}\n.QuestionComposer_iconButton:hover:not(:disabled) {\n  background: var(--cfg-hover);\n  color: var(--cfg-ink);\n}\n.QuestionComposer_card button:focus-visible {\n  outline: 2px solid var(--cfg-accent);\n  outline-offset: -2px;\n}\n.QuestionComposer_card button:disabled {\n  cursor: default;\n}\n.QuestionComposer_iconButton:disabled,\n.QuestionComposer_footerActions > button:disabled,\n.QuestionComposer_card[aria-busy=true] .QuestionComposer_option {\n  opacity: 0.4;\n}\n.QuestionComposer_iconButton:active:not(:disabled),\n.QuestionComposer_option:active:not(:disabled) {\n  background: var(--cfg-hover);\n}\n.QuestionComposer_body {\n  display: flex;\n  flex: 1 1 auto;\n  flex-direction: column;\n  min-height: 0;\n  overflow-y: auto;\n  overscroll-behavior: contain;\n  scrollbar-gutter: stable;\n}\n.QuestionComposer_detail {\n  margin: 0 16px 8px;\n  color: var(--cfg-muted);\n}\n.QuestionComposer_options {\n  display: flex;\n  flex-direction: column;\n  gap: 2px;\n  padding: 0 6px 6px;\n}\n.QuestionComposer_option,\n.QuestionComposer_customRow {\n  display: flex;\n  align-items: flex-start;\n  flex-shrink: 0;\n  gap: 8px;\n  width: 100%;\n  min-height: 32px;\n  padding: 4px 8px;\n  border: 1px solid transparent;\n  border-radius: 8px;\n}\n.QuestionComposer_option {\n  background: transparent;\n  color: inherit;\n  text-align: left;\n  cursor: pointer;\n  font: inherit;\n}\n.QuestionComposer_option:hover:not(:disabled),\n.QuestionComposer_customRow:hover {\n  background: var(--cfg-hover);\n}\n.QuestionComposer_optionSelected,\n.QuestionComposer_optionSelected:hover:not(:disabled),\n.QuestionComposer_customRowActive {\n  border-color: var(--cfg-accent);\n  background: color-mix(in srgb, var(--cfg-accent) 8%, transparent);\n}\n.QuestionComposer_radio,\n.QuestionComposer_checkbox,\n.QuestionComposer_customIcon {\n  display: grid;\n  place-items: center;\n  flex: 0 0 20px;\n  width: 20px;\n  height: 20px;\n  color: var(--cfg-muted);\n}\n.QuestionComposer_radio::before,\n.QuestionComposer_checkbox::before {\n  content: "";\n  box-sizing: border-box;\n  grid-area: 1 / 1;\n  width: 16px;\n  height: 16px;\n  border: 1px solid var(--dsw-alias-border-l4);\n}\n.QuestionComposer_radio::before {\n  border-radius: 50%;\n}\n.QuestionComposer_radioChecked::before {\n  border-color: var(--cfg-accent);\n}\n.QuestionComposer_radioChecked::after {\n  content: "";\n  grid-area: 1 / 1;\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  background: var(--cfg-accent);\n}\n.QuestionComposer_checkbox::before {\n  border-radius: 4px;\n}\n.QuestionComposer_checkbox > svg {\n  grid-area: 1 / 1;\n}\n.QuestionComposer_checkboxChecked {\n  color: var(--cfg-accent);\n}\n.QuestionComposer_checkboxChecked::before {\n  border-color: currentColor;\n  background: color-mix(in srgb, var(--cfg-accent) 10%, transparent);\n}\n.QuestionComposer_optionCopy {\n  display: grid;\n  gap: 2px;\n  min-width: 0;\n  flex: 1;\n}\n.QuestionComposer_optionLine {\n  display: flex;\n  align-items: baseline;\n  flex-wrap: wrap;\n  gap: 2px 6px;\n}\n.QuestionComposer_optionLabel {\n  display: block;\n  font-size: inherit;\n  font-weight: 500;\n  line-height: 20px;\n}\n.QuestionComposer_badge {\n  padding: 0 4px;\n  border: 1px solid var(--cfg-line);\n  border-radius: 4px;\n  color: var(--cfg-muted);\n  font-size: 11px;\n  font-weight: 400;\n  line-height: 16px;\n}\n.QuestionComposer_description {\n  display: block;\n  color: var(--cfg-muted);\n  font-size: 12px;\n  line-height: 20px;\n  font-weight: 400;\n}\n.QuestionComposer_reviewStatus {\n  margin: 0;\n  padding: 0 16px 8px;\n  color: var(--cfg-muted);\n  font-size: 12px;\n  line-height: 20px;\n}\n.QuestionComposer_reviewNote {\n  margin: 0;\n  padding: 6px 8px;\n  color: var(--cfg-muted);\n  font-size: 12px;\n  line-height: 20px;\n}\n.QuestionComposer_customRow {\n  margin-top: 8px;\n  border-color: var(--cfg-line);\n  background: var(--dsw-alias-bg-layer-1);\n}\n.QuestionComposer_customRow:has(.QuestionComposer_fieldInput:focus-visible),\n.QuestionComposer_customBlock:has(.QuestionComposer_fieldInput:focus-visible) {\n  outline: 2px solid var(--cfg-accent);\n  outline-offset: -2px;\n}\n.QuestionComposer_field {\n  display: grid;\n  min-width: 0;\n  --dsh-answer-field-padding: 0;\n}\n.QuestionComposer_field > * {\n  grid-area: 1 / 1;\n  min-width: 0;\n  padding: var(--dsh-answer-field-padding);\n  font: inherit;\n  font-size: inherit;\n  line-height: 20px;\n  white-space: pre-wrap;\n  word-break: break-word;\n  overflow-wrap: anywhere;\n}\n.QuestionComposer_fieldMirror {\n  box-sizing: content-box;\n  max-height: 120px;\n  overflow: hidden;\n  visibility: hidden;\n}\n.QuestionComposer_fieldInput {\n  resize: none;\n  overflow-y: auto;\n  border: 0;\n  outline: none;\n  background: transparent;\n  color: var(--cfg-ink);\n  caret-color: var(--cfg-accent);\n}\n.QuestionComposer_fieldInput::placeholder {\n  color: var(--dsw-alias-label-tertiary);\n}\n.QuestionComposer_customInline {\n  flex: 1;\n}\n.QuestionComposer_customBlock {\n  min-height: 60px;\n  flex-shrink: 0;\n  margin: 0 8px;\n  border: 1px solid var(--cfg-line);\n  border-radius: 8px;\n  --dsh-answer-field-padding: 8px 12px;\n}\n.QuestionComposer_footer {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  flex-shrink: 0;\n  gap: 8px;\n  padding: 6px 12px;\n  border-top: 1px solid var(--cfg-line);\n}\n.QuestionComposer_progress {\n  padding: 0 4px;\n  color: var(--cfg-muted);\n  font-size: 11px;\n  font-variant-numeric: tabular-nums;\n  line-height: 20px;\n  white-space: nowrap;\n}\n.QuestionComposer_feedback {\n  flex: 1;\n  min-width: 0;\n  color: var(--cfg-muted);\n  font-size: 12px;\n  line-height: 18px;\n  overflow-wrap: anywhere;\n  text-align: right;\n}\n.QuestionComposer_feedback[data-error] {\n  color: var(--cfg-danger);\n}\n.QuestionComposer_button,\n.QuestionComposer_primary {\n  appearance: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 6px;\n  min-height: 32px;\n  padding: 0 12px;\n  border: 1px solid var(--cfg-line);\n  border-radius: 8px;\n  box-shadow: none;\n  background: transparent;\n  color: var(--cfg-ink);\n  font: inherit;\n  font-size: 13px;\n  font-weight: 500;\n  cursor: pointer;\n}\n.QuestionComposer_button:hover:not(:disabled) {\n  background: var(--cfg-hover);\n}\n.QuestionComposer_primary {\n  min-width: 128px;\n  border-color: transparent;\n  background: var(--cfg-solid);\n  color: var(--cfg-on-solid);\n}\n.QuestionComposer_primary:hover:not(:disabled) {\n  background: var(--cfg-solid-hover);\n}\n.QuestionComposer_iconButton,\n.QuestionComposer_option {\n  appearance: none;\n  box-shadow: none;\n}\n.QuestionComposer_spinner {\n  width: 12px;\n  height: 12px;\n  border: 1px solid currentColor;\n  border-right-color: transparent;\n  border-radius: 50%;\n  animation: QuestionComposer_spin 800ms linear infinite;\n}\n@keyframes QuestionComposer_spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n.QuestionComposer_feedback:empty {\n  display: none;\n}\n@media (max-width: 720px) {\n  .QuestionComposer_card {\n    max-height: calc(100vh - 160px);\n    max-height: calc(100dvh - 160px);\n  }\n  .QuestionComposer_frame {\n    padding-inline: 16px;\n  }\n  .QuestionComposer_header {\n    gap: 8px;\n    padding: 12px 16px 8px;\n  }\n  .QuestionComposer_field > * {\n    font-size: 16px;\n    line-height: 24px;\n  }\n  .QuestionComposer_fieldMirror {\n    max-height: 144px;\n  }\n  .QuestionComposer_option,\n  .QuestionComposer_customRow,\n  .QuestionComposer_card button {\n    min-height: 44px;\n  }\n  .QuestionComposer_iconButton {\n    width: 44px;\n    height: 44px;\n  }\n  .QuestionComposer_footer {\n    flex-wrap: wrap;\n    padding: 8px 12px;\n  }\n  .QuestionComposer_feedback {\n    flex: 1 1 100%;\n    order: 1;\n    text-align: left;\n  }\n  .QuestionComposer_footerActions {\n    margin-left: auto;\n  }\n}\n@media (max-width: 420px) {\n  .QuestionComposer_header {\n    flex-wrap: wrap;\n  }\n  .QuestionComposer_headingBlock {\n    flex-basis: calc(100% - 104px);\n  }\n  .QuestionComposer_footerActions {\n    flex: 1 1 100%;\n  }\n  .QuestionComposer_footerActions > button {\n    flex: 1;\n  }\n}\n@media (pointer: coarse) {\n  .QuestionComposer_option,\n  .QuestionComposer_customRow,\n  .QuestionComposer_card button {\n    min-height: 44px;\n  }\n  .QuestionComposer_iconButton {\n    width: 44px;\n    height: 44px;\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .QuestionComposer_spinner {\n    animation: none;\n  }\n  .QuestionComposer_option,\n  .QuestionComposer_customRow {\n    transition: none;\n  }\n}\n[data-ds-dark-theme] .QuestionComposer_frame {\n  --cfg-accent: var(--dsw-alias-state-business-primary, #4eb0e8);\n  --cfg-accent-text: color-mix(in srgb, var(--cfg-accent) 70%, var(--cfg-ink));\n  --cfg-solid: var(--dsw-alias-button-primary-fill, #4eb0e8);\n  --cfg-solid-hover: color-mix(in srgb, var(--cfg-solid) 88%, var(--cfg-on-solid));\n  --cfg-on-solid: var(--dsw-alias-label-primary-foreground, #0e1014);\n}\n';
var id4 = "dsh-better-ask-user/QuestionComposer.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(id4) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-better-ask-user";
  tag.dataset.pluginCss = id4;
  tag.textContent = css4;
  document.head.appendChild(tag);
}
var QuestionComposer_default = {
  frame: "QuestionComposer_frame",
  card: "QuestionComposer_card",
  cardMinimized: "QuestionComposer_cardMinimized",
  header: "QuestionComposer_header",
  headingBlock: "QuestionComposer_headingBlock",
  eyebrow: "QuestionComposer_eyebrow",
  title: "QuestionComposer_title",
  optionLabel: "QuestionComposer_optionLabel",
  description: "QuestionComposer_description",
  detail: "QuestionComposer_detail",
  headerActions: "QuestionComposer_headerActions",
  footerActions: "QuestionComposer_footerActions",
  pager: "QuestionComposer_pager",
  iconButton: "QuestionComposer_iconButton",
  option: "QuestionComposer_option",
  body: "QuestionComposer_body",
  options: "QuestionComposer_options",
  customRow: "QuestionComposer_customRow",
  optionSelected: "QuestionComposer_optionSelected",
  customRowActive: "QuestionComposer_customRowActive",
  radio: "QuestionComposer_radio",
  checkbox: "QuestionComposer_checkbox",
  customIcon: "QuestionComposer_customIcon",
  radioChecked: "QuestionComposer_radioChecked",
  checkboxChecked: "QuestionComposer_checkboxChecked",
  optionCopy: "QuestionComposer_optionCopy",
  optionLine: "QuestionComposer_optionLine",
  badge: "QuestionComposer_badge",
  reviewStatus: "QuestionComposer_reviewStatus",
  reviewNote: "QuestionComposer_reviewNote",
  fieldInput: "QuestionComposer_fieldInput",
  customBlock: "QuestionComposer_customBlock",
  field: "QuestionComposer_field",
  fieldMirror: "QuestionComposer_fieldMirror",
  customInline: "QuestionComposer_customInline",
  footer: "QuestionComposer_footer",
  progress: "QuestionComposer_progress",
  feedback: "QuestionComposer_feedback",
  button: "QuestionComposer_button",
  primary: "QuestionComposer_primary",
  spinner: "QuestionComposer_spinner",
  spin: "QuestionComposer_spin"
};
var css_modules_entry_default4 = QuestionComposer_default;

// src/client/QuestionComposer.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var REMOVED_CARD = {
  state: "open",
  waitState: "counting",
  countdown: void 0,
  channel: "none",
  closed: true
};
function parseRecommendedLabel(label) {
  const suffix = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i;
  return suffix.test(label) ? { label: label.replace(suffix, ""), recommended: true } : { label, recommended: false };
}
function recommendedFirstOption(question) {
  if (question.intent?.kind === "approval" || question.intent?.kind === "plan-review") return void 0;
  const label = question.options?.[0]?.label;
  return label !== void 0 && parseRecommendedLabel(label).recommended ? label : void 0;
}
function isQuestionDraftProgress(value, questionCount) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const progress = value;
  if (typeof progress.index !== "number" || !Number.isInteger(progress.index) || progress.index < 0 || progress.index >= questionCount || !Array.isArray(progress.drafts) || progress.drafts.length !== questionCount || progress.wait !== void 0 && progress.wait !== "editing" && progress.wait !== "waiting") return false;
  return progress.drafts.every((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return false;
    const draft = item;
    return Array.isArray(draft.selected) && draft.selected.every((label) => typeof label === "string") && typeof draft.custom === "string" && typeof draft.skipped === "boolean";
  });
}
function isComposing(event) {
  return event.nativeEvent.isComposing || Reflect.get(event.nativeEvent, "keyCode") === 229;
}
function AnswerField(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: clsx_default(css_modules_entry_default4.field, props.variant === "inline" ? css_modules_entry_default4.customInline : css_modules_entry_default4.customBlock), children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { "aria-hidden": true, className: css_modules_entry_default4.fieldMirror, children: `${props.value}
` }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "textarea",
      {
        autoFocus: props.autoFocus,
        className: css_modules_entry_default4.fieldInput,
        value: props.value,
        disabled: props.disabled,
        rows: 1,
        placeholder: props.placeholder,
        "aria-labelledby": props.labelledBy,
        onFocus: props.onFocus,
        onChange: props.onChange,
        onKeyDown: props.onKeyDown
      }
    )
  ] });
}
function QuestionComposer(props) {
  const question = props.matched;
  const review = (0, import_react4.useMemo)(() => planReviewOf(question.questions), [question]);
  return review === void 0 ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
    QuestionFlow,
    {
      pending: question,
      t: props.t,
      useStore: props.useStore,
      useQuestionCard: props.useQuestionCard,
      actions: props.actions
    },
    question.key
  ) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(PlanReviewPanel, { pending: question, review, t: props.t, renderSlot: props.renderSlot, useQuestionCard: props.useQuestionCard }, question.key);
}
function QuestionFlow({ pending, t, useStore, useQuestionCard, actions }) {
  const questions = pending.questions;
  const review = pending.review;
  const markdownLabels = (0, import_react4.useMemo)(() => ({
    code: { copyLabel: t("copy"), copiedLabel: t("copied"), toolbarLabels: { codeLabel: t("codeBlock.title"), wrapLabel: t("codeBlock.wrap"), unwrapLabel: t("codeBlock.unwrap") } },
    footnotes: t("markdown.footnotes")
  }), [t]);
  const initialDrafts = (0, import_react4.useMemo)(() => {
    const recorded = new Map((review ?? []).map((answer) => [answer.id, answer]));
    return questions.map((item) => {
      const answer = recorded.get(item.id);
      const custom = answer?.custom ?? "";
      const recommended = review === void 0 ? recommendedFirstOption(item) : void 0;
      return {
        selected: answer === void 0 && recommended !== void 0 ? [recommended] : [...answer?.selected ?? []],
        custom,
        // A recorded answer with no selection and no custom text was skipped.
        skipped: answer !== void 0 && answer.selected.length === 0 && custom === ""
      };
    });
  }, [questions, review]);
  const stored = useStore((state) => state.progressByRequest[pending.key]);
  const validStored = isQuestionDraftProgress(stored, questions.length) ? stored : void 0;
  const storedProgress = review === void 0 ? validStored : void 0;
  const index = validStored?.index ?? 0;
  const drafts = storedProgress?.drafts ?? initialDrafts;
  const restoredWait = storedProgress?.wait ?? (storedProgress?.drafts.some((item, itemIndex) => item.selected.length !== initialDrafts[itemIndex]?.selected.length || item.selected.some((label, labelIndex) => label !== initialDrafts[itemIndex]?.selected[labelIndex]) || item.custom !== "" || item.skipped) === true ? "editing" : void 0);
  const [busy, setBusy] = (0, import_react4.useState)(null);
  const [error, setError] = (0, import_react4.useState)(null);
  const card = useQuestionCard(pending.key, (snapshot) => snapshot ?? REMOVED_CARD);
  const canSubmit = !card.closed && card.channel !== "none";
  const locked = busy !== null || review !== void 0;
  const sentVia = (0, import_react4.useRef)(null);
  (0, import_react4.useEffect)(() => {
    if (sentVia.current !== "waterfall" || card.state !== "continued") return;
    sentVia.current = null;
    setBusy(null);
    setError({ key: "error.resubmit" });
  }, [card.state]);
  (0, import_react4.useEffect)(() => {
    if (card.closed) actions.clear(pending.key);
  }, [actions, card.closed, pending.key]);
  (0, import_react4.useEffect)(() => {
    actions.prune(pending.liveKeys());
  }, [actions, pending]);
  const waitDisposition = (0, import_react4.useRef)(restoredWait);
  (0, import_react4.useEffect)(() => {
    if (waitDisposition.current === "waiting") pending.takeTime();
    if (waitDisposition.current === "editing") pending.bump();
  }, [pending]);
  const countdown = card.countdown;
  const [minimized, setMinimized] = (0, import_react4.useState)(false);
  const focusedQuestions = (0, import_react4.useRef)(/* @__PURE__ */ new Set());
  const answerSurface = (0, import_react4.useRef)(null);
  const question = questions[index];
  const draft = drafts[index];
  const hasOptions = (question.options?.length ?? 0) > 0;
  const fixedActions = question.intent?.kind === "approval";
  const questionId = `question-${pending.key}-${String(index)}`;
  const replaceProgress = (nextIndex, nextDrafts) => {
    pending.bump();
    actions.replace(pending.key, {
      index: nextIndex,
      drafts: nextDrafts,
      ...waitDisposition.current === void 0 ? {} : { wait: waitDisposition.current }
    });
  };
  const takeTime = () => {
    waitDisposition.current = "waiting";
    pending.takeTime();
    replaceProgress(index, drafts);
  };
  const focusAnswerSurface = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) pending.holdFocus();
  };
  const blurAnswerSurface = (event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) pending.releaseFocus();
  };
  (0, import_react4.useEffect)(() => {
    const release = () => {
      pending.releaseFocus();
    };
    const refocus = () => {
      if (answerSurface.current?.contains(document.activeElement) === true) pending.holdFocus();
    };
    const visibilityChanged = () => {
      if (document.hidden) release();
      else refocus();
    };
    window.addEventListener("blur", release);
    window.addEventListener("focus", refocus);
    document.addEventListener("visibilitychange", visibilityChanged);
    return () => {
      release();
      window.removeEventListener("blur", release);
      window.removeEventListener("focus", refocus);
      document.removeEventListener("visibilitychange", visibilityChanged);
    };
  }, [pending]);
  const dismissFlow = () => {
    if (pending.dismissal === "hide") {
      void pending.dismiss();
      return;
    }
    if (!canSubmit) {
      setError({ key: "error.unavailable" });
      return;
    }
    setBusy("cancel");
    setError(null);
    sentVia.current = "waterfall";
    void pending.dismiss().catch((cause) => {
      sentVia.current = null;
      setBusy(null);
      setError({ text: cause instanceof Error ? cause.message : String(cause) });
    });
  };
  const updateDraft = (update, nextIndex = index) => {
    const nextDrafts = drafts.map((item, itemIndex) => itemIndex === index ? update(item) : item);
    replaceProgress(nextIndex, nextDrafts);
    setError(null);
  };
  const choose = (label, advance = true) => {
    updateDraft((current) => {
      if (question.multiSelect === true) {
        const selected = current.selected.includes(label) ? current.selected.filter((item) => item !== label) : [...current.selected, label];
        return { ...current, selected, skipped: false };
      }
      return { selected: [label], custom: "", skipped: false };
    }, advance && question.multiSelect !== true && index < questions.length - 1 ? index + 1 : index);
  };
  const navigateOptions = (event, optionIndex) => {
    if (question.multiSelect === true || locked || event.defaultPrevented) return;
    const options = question.options ?? [];
    let next;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (optionIndex + 1) % options.length;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = (optionIndex - 1 + options.length) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.parentElement?.querySelectorAll('[role="radio"]')[next]?.focus();
    choose(options[next].label, false);
  };
  const answered = (item) => item.selected.length > 0 || item.custom.trim() !== "";
  const completed = (item) => answered(item) || item.skipped;
  const submitDrafts = (values) => {
    const missing = values.findIndex((item) => !completed(item));
    if (missing >= 0) {
      replaceProgress(missing, values);
      setError({ key: "error.incomplete" });
      return;
    }
    if (!canSubmit) {
      setError({ key: "error.unavailable" });
      return;
    }
    const answer = {
      answers: questions.map((item, itemIndex) => {
        const value = values[itemIndex];
        if (value.skipped) return { id: item.id, selected: [] };
        const custom = value.custom.trim();
        return {
          id: item.id,
          selected: custom === "" || item.multiSelect === true ? value.selected : [],
          ...custom === "" ? {} : { custom }
        };
      })
    };
    setBusy("answer");
    setError(null);
    const channel = pending.snapshot().channel;
    sentVia.current = channel === "waterfall" ? "waterfall" : null;
    void pending.answer(answer).then(() => {
      if (channel !== "rpc") return;
      sentVia.current = null;
      setBusy(null);
      setError(null);
      void pending.dismiss().catch(() => {
        setError({ key: "status.sent" });
      });
    }).catch((cause) => {
      sentVia.current = null;
      setBusy(null);
      setError({ text: cause instanceof Error ? cause.message : String(cause) });
    });
  };
  const continueFlow = () => {
    if (!answered(draft)) {
      setError({ key: "error.unanswered" });
      return;
    }
    if (index < questions.length - 1) {
      replaceProgress(index + 1, drafts);
      setError(null);
      return;
    }
    submitDrafts(drafts);
  };
  const draftCustom = (event) => {
    const value = event.target.value;
    updateDraft((current) => ({
      ...current,
      selected: question.multiSelect === true ? current.selected : [],
      custom: value,
      skipped: false
    }));
  };
  const continueFromCustom = (event) => {
    if (event.defaultPrevented || event.repeat || event.key !== "Enter" || event.shiftKey || isComposing(event)) return;
    event.preventDefault();
    continueFlow();
  };
  const skipQuestion = () => {
    const nextDrafts = drafts.map((item, itemIndex) => itemIndex === index ? { selected: [], custom: "", skipped: true } : item);
    replaceProgress(index < questions.length - 1 ? index + 1 : index, nextDrafts);
    setError(null);
    if (index < questions.length - 1) {
      return;
    }
    submitDrafts(nextDrafts);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: css_modules_entry_default4.frame, "data-question-key": pending.key, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
    "section",
    {
      ref: answerSurface,
      className: clsx_default(css_modules_entry_default4.card, minimized && css_modules_entry_default4.cardMinimized),
      onFocusCapture: focusAnswerSurface,
      onBlurCapture: blurAnswerSurface,
      "aria-labelledby": questionId,
      "aria-busy": busy !== null,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("header", { className: css_modules_entry_default4.header, children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: css_modules_entry_default4.headingBlock, children: [
            question.header !== void 0 && question.header.trim() !== question.question.trim() && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: css_modules_entry_default4.eyebrow, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.MarkdownText, { text: question.header, variant: "compact", labels: markdownLabels }) }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "div",
              {
                className: css_modules_entry_default4.title,
                id: questionId,
                role: "heading",
                "aria-level": 2,
                children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.MarkdownText, { text: question.question, variant: "compact", labels: markdownLabels })
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: css_modules_entry_default4.headerActions, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "button",
              {
                type: "button",
                className: css_modules_entry_default4.iconButton,
                "aria-label": t(minimized ? "nav.maximize" : "nav.minimize"),
                title: t(minimized ? "nav.maximize" : "nav.minimize"),
                "aria-expanded": !minimized,
                disabled: busy !== null,
                onClick: () => {
                  setMinimized((current) => !current);
                },
                children: minimized ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.IconChevronUpOutlineRegular, {}) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.IconChevronDownOutlineRegular, {})
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "button",
              {
                type: "button",
                className: css_modules_entry_default4.iconButton,
                "aria-label": t(pending.dismissal === "hide" ? "nav.close" : "nav.cancel"),
                title: t(pending.dismissal === "hide" ? "nav.close" : "nav.cancel"),
                disabled: busy !== null,
                onClick: dismissFlow,
                children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.IconCloseOutlineRegular, {})
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(QuestionWaitBar, { card, t, busy: busy !== null, onTakeTime: takeTime }),
        review !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: css_modules_entry_default4.reviewStatus, children: review.length === 0 ? t("review.unanswered") : t("review.status") }),
        !minimized && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
            "div",
            {
              className: css_modules_entry_default4.body,
              "data-question-scroll": true,
              children: [
                question.detail !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: css_modules_entry_default4.detail, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.MarkdownText, { text: question.detail, labels: markdownLabels }) }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: css_modules_entry_default4.options, role: hasOptions && question.multiSelect !== true ? "radiogroup" : "group", "aria-labelledby": questionId, children: [
                  (question.options ?? []).map((option, optionIndex) => {
                    const selected = draft.selected.includes(option.label);
                    const display = parseRecommendedLabel(option.label);
                    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
                      "button",
                      {
                        type: "button",
                        className: clsx_default(css_modules_entry_default4.option, selected && css_modules_entry_default4.optionSelected),
                        role: question.multiSelect === true ? "checkbox" : "radio",
                        "aria-checked": selected,
                        "aria-label": display.recommended ? `${display.label}, ${t("option.recommended")}` : display.label,
                        "aria-describedby": option.description === void 0 ? void 0 : `${questionId}-option-${String(optionIndex)}`,
                        disabled: locked,
                        tabIndex: question.multiSelect === true || selected || draft.selected.length === 0 && optionIndex === 0 ? 0 : -1,
                        onKeyDown: (event) => {
                          navigateOptions(event, optionIndex);
                        },
                        onClick: () => {
                          choose(option.label);
                        },
                        children: [
                          question.multiSelect === true ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: clsx_default(css_modules_entry_default4.checkbox, selected && css_modules_entry_default4.checkboxChecked), "aria-hidden": "true", children: selected && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.IconCheckOutlineRegular, { size: 12 }) }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: clsx_default(css_modules_entry_default4.radio, selected && css_modules_entry_default4.radioChecked), "aria-hidden": "true" }),
                          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: css_modules_entry_default4.optionCopy, children: [
                            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: css_modules_entry_default4.optionLine, children: [
                              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: css_modules_entry_default4.optionLabel, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.MarkdownText, { text: display.label, variant: "compact", labels: markdownLabels }) }),
                              display.recommended && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: css_modules_entry_default4.badge, children: t("option.recommended") })
                            ] }),
                            option.description !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: css_modules_entry_default4.description, id: `${questionId}-option-${String(optionIndex)}`, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.MarkdownText, { text: option.description, variant: "compact", labels: markdownLabels }) })
                          ] })
                        ]
                      },
                      `${option.label}-${String(optionIndex)}`
                    );
                  }),
                  review !== void 0 && draft.skipped && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { className: css_modules_entry_default4.reviewNote, children: t("review.skipped") }),
                  !fixedActions && (review === void 0 || draft.custom !== "") && (hasOptions ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
                    "div",
                    {
                      className: clsx_default(
                        css_modules_entry_default4.customRow,
                        draft.custom !== "" && css_modules_entry_default4.customRowActive
                      ),
                      children: [
                        question.multiSelect === true ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                          "span",
                          {
                            className: clsx_default(css_modules_entry_default4.checkbox, draft.custom !== "" && css_modules_entry_default4.checkboxChecked),
                            "aria-hidden": "true",
                            children: draft.custom !== "" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.IconCheckOutlineRegular, { size: 12 })
                          }
                        ) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: css_modules_entry_default4.customIcon, "aria-hidden": "true", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.IconEditOutlineRegular, { size: 12 }) }),
                        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                          AnswerField,
                          {
                            variant: "inline",
                            value: draft.custom,
                            disabled: locked,
                            placeholder: t("custom.placeholder"),
                            labelledBy: questionId,
                            onChange: draftCustom,
                            onKeyDown: continueFromCustom
                          }
                        )
                      ]
                    }
                  ) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                    AnswerField,
                    {
                      autoFocus: canSubmit && countdown === void 0 && !locked && !focusedQuestions.current.has(index),
                      variant: "block",
                      value: draft.custom,
                      disabled: locked,
                      placeholder: t("custom.placeholder"),
                      labelledBy: questionId,
                      onFocus: () => {
                        focusedQuestions.current.add(index);
                      },
                      onChange: draftCustom,
                      onKeyDown: continueFromCustom
                    }
                  ))
                ] })
              ]
            }
          ),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("footer", { className: css_modules_entry_default4.footer, children: [
            questions.length > 1 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: css_modules_entry_default4.pager, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  className: css_modules_entry_default4.iconButton,
                  "aria-label": t("nav.prev"),
                  disabled: index === 0 || busy !== null,
                  onClick: () => {
                    replaceProgress(index - 1, drafts);
                    setError(null);
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.IconChevronLeftOutlineRegular, {})
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { className: css_modules_entry_default4.progress, children: [
                index + 1,
                " / ",
                questions.length
              ] }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  className: css_modules_entry_default4.iconButton,
                  "aria-label": t("nav.next"),
                  disabled: index === questions.length - 1 || busy !== null,
                  onClick: () => {
                    replaceProgress(index + 1, drafts);
                    setError(null);
                  },
                  children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.IconChevronRightOutlineRegular, {})
                }
              )
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { className: css_modules_entry_default4.feedback, role: "status", "aria-atomic": "true", "data-error": error !== null && (!("key" in error) || error.key !== "status.sent") || void 0, children: error === null ? null : "key" in error ? t(error.key) : error.text }),
            review === void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { className: css_modules_entry_default4.footerActions, children: [
              !fixedActions && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(import_dsh_client_ui_primitives3.Button, { variant: "outline", className: css_modules_entry_default4.button, disabled: busy !== null, onClick: skipQuestion, children: t("action.skip") }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
                import_dsh_client_ui_primitives3.Button,
                {
                  variant: "primary",
                  className: css_modules_entry_default4.primary,
                  "aria-busy": busy === "answer",
                  disabled: busy !== null || !answered(draft) || index === questions.length - 1 && !canSubmit,
                  onClick: continueFlow,
                  children: [
                    busy === "answer" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { className: css_modules_entry_default4.spinner, "aria-hidden": "true" }),
                    busy === "answer" ? t("submitting") : index === questions.length - 1 ? t("submit") : t("action.next")
                  ]
                }
              )
            ] })
          ] })
        ] })
      ]
    }
  ) });
}

// ../../node_modules/.pnpm/@deepseek-ai+dsh-session@0.2.2-rc.1_@deepseek-ai+cordis@4.0.5_@deepseek-ai+dsh-scope@0._afb83d2b56032cae035033a33f0caf9c/node_modules/@deepseek-ai/dsh-session/lib/types/surface.js
var SURFACE_EVENT_TYPES = /* @__PURE__ */ new Set([
  "system/message",
  "developer/message",
  "user/message",
  "assistant/message",
  "tool/result"
]);
function isSurfaceEvent(event) {
  if (!SURFACE_EVENT_TYPES.has(event.type))
    return false;
  const candidate = event;
  return candidate.surfaceOp !== void 0;
}
function isAppendSurfaceEvent(event) {
  return isSurfaceEvent(event) && event.surfaceOp === "append";
}

// src/client/question-reply.ts
function isRecord2(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function replyPairsOf(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error) {
    void error;
    return { questions: [], answers: [] };
  }
  if (!isRecord2(value) || !Array.isArray(value.questions)) {
    return { questions: [], answers: [] };
  }
  const questions = [];
  for (const question of value.questions) {
    if (!isRecord2(question) || typeof question.id !== "string" || typeof question.question !== "string") continue;
    questions.push({
      id: question.id,
      question: question.question,
      ...typeof question.detail === "string" ? { detail: question.detail } : {},
      ...typeof question.header === "string" ? { header: question.header } : {},
      ...Array.isArray(question.options) ? { options: question.options.flatMap((option) => {
        if (!isRecord2(option) || typeof option.label !== "string") return [];
        return [{ label: option.label, ...typeof option.description === "string" ? { description: option.description } : {} }];
      }) } : {},
      ...typeof question.multiSelect === "boolean" ? { multiSelect: question.multiSelect } : {}
    });
  }
  const answers = [];
  for (const answer of Array.isArray(value.answers) ? value.answers : []) {
    if (!isRecord2(answer) || typeof answer.id !== "string" || !Array.isArray(answer.selected)) continue;
    answers.push({
      id: answer.id,
      selected: answer.selected.filter((item) => typeof item === "string"),
      ...typeof answer.custom === "string" ? { custom: answer.custom } : {}
    });
  }
  return { questions, answers };
}
function replyAnswerValues(data, id7) {
  const answer = data.answers.find((item) => item.id === id7);
  const custom = answer?.custom?.trim() ?? "";
  return [...answer?.selected ?? [], ...custom === "" ? [] : [custom]];
}
function replyClipboardText(data, t) {
  if (data.questions.length === 0) return data.text;
  return data.questions.map((question) => {
    const values = replyAnswerValues(data, question.id);
    const heading = question.header && question.header !== question.question ? `${question.header} \u2014 ${question.question}` : question.question;
    const answer = values.length === 0 ? t("reply.skipped") : `${t("reply.answerLabel")}${values.join(", ")}`;
    return `${heading}
${answer}`;
  }).join("\n\n");
}
function replySource(event) {
  const source = event.data.source;
  return isRecord2(source) && source.kind === "user-question-reply" && typeof source.callId === "string" && source.outcome === "answered" ? { callId: source.callId, outcome: "answered" } : null;
}
var questionReplyDefinition = {
  kind: "user-question-reply",
  target: "chat",
  match: (event) => {
    if (event.type !== "user/message" || !isAppendSurfaceEvent(event)) return null;
    return replySource(event) === null ? null : { id: String(event.data.id), role: "start", exclusive: true };
  },
  start: (_context, match) => {
    if (match.event.type !== "user/message") throw new Error("user-question-reply start requires user/message");
    const event = match.event;
    const block = event.data.content.find((item) => item.type === "text");
    const text = block?.text ?? "";
    const source = replySource(event);
    if (source === null) throw new Error("user-question-reply start requires a reply source");
    return {
      seq: event.seq,
      time: event.time,
      callId: source.callId,
      outcome: source.outcome,
      text,
      ...replyPairsOf(text)
    };
  },
  update: (context) => context.state,
  buildViewNode: (context) => {
    if (context.state === void 0) return null;
    const { seq, ...data } = context.state;
    return {
      key: context.key,
      kind: "question-reply",
      id: context.id,
      target: "chat",
      anchorSeq: seq,
      location: context.start?.location ?? { kind: "unresolved" },
      visibility: "visible",
      data
    };
  }
};

// src/client/QuestionReplyView.tsx
var import_react5 = require("react");
var import_dsh_client_ui_primitives4 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/QuestionReplyView.module.css
var css5 = "/* src/client/QuestionReplyView.module.css */\n.QuestionReplyView_row {\n  --cfg-line: var(--dsw-alias-border-l2);\n  --cfg-surface: var(--dsw-alias-bg-layer-3);\n  --cfg-ink: var(--dsw-alias-label-primary);\n  --cfg-muted: var(--dsw-alias-label-secondary);\n  --cfg-accent: var(--dsw-alias-state-business-primary, #3388bb);\n  --cfg-accent-text: color-mix(in srgb, var(--cfg-accent) 70%, var(--cfg-ink));\n  --cfg-hover: var(--dsw-alias-interactive-bg-hover);\n  display: flex;\n  flex-direction: column;\n  align-items: flex-end;\n  gap: 4px;\n  min-width: 0;\n  padding: 4px 0;\n}\n.QuestionReplyView_bubble {\n  max-width: 85%;\n  min-width: 0;\n  overflow: hidden;\n  border: 1px solid var(--cfg-line);\n  border-radius: 10px;\n  background: var(--cfg-surface);\n  color: var(--cfg-ink);\n  font-size: inherit;\n  line-height: 1.5;\n  text-align: left;\n  overflow-wrap: anywhere;\n}\n.QuestionReplyView_toggle {\n  appearance: none;\n  display: block;\n  width: 100%;\n  padding: 8px 10px;\n  border: 0;\n  background: transparent;\n  color: inherit;\n  cursor: pointer;\n  font: inherit;\n  text-align: left;\n}\n.QuestionReplyView_toggle:hover {\n  background: var(--cfg-hover);\n}\n.QuestionReplyView_toggle:focus-visible {\n  outline: 2px solid var(--cfg-accent);\n  outline-offset: -3px;\n  border-radius: 8px;\n}\n.QuestionReplyView_labelRow {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n}\n.QuestionReplyView_caret {\n  display: inline-flex;\n  flex: none;\n  color: var(--cfg-muted);\n}\n.QuestionReplyView_caret svg {\n  width: 12px;\n  height: 12px;\n}\n.QuestionReplyView_label {\n  color: var(--cfg-muted);\n  font-size: 12px;\n  font-weight: 500;\n}\n.QuestionReplyView_summary {\n  display: -webkit-box;\n  -webkit-box-orient: vertical;\n  -webkit-line-clamp: 3;\n  overflow: hidden;\n  margin-top: 4px;\n  white-space: pre-wrap;\n}\n.QuestionReplyView_text {\n  margin: 0;\n  padding: 0 10px 10px;\n  white-space: pre-wrap;\n}\n.QuestionReplyView_details {\n  max-height: min(50vh, 400px);\n  margin: 0;\n  padding: 0 10px 10px;\n  overflow: auto;\n  overscroll-behavior: contain;\n  scrollbar-width: thin;\n  scrollbar-gutter: stable;\n}\n.QuestionReplyView_details > div {\n  padding-top: 10px;\n  border-top: 1px solid var(--cfg-line);\n}\n.QuestionReplyView_details > div + div {\n  margin-top: 12px;\n}\n.QuestionReplyView_question {\n  display: grid;\n  gap: 4px;\n  font-size: inherit;\n}\n.QuestionReplyView_questionText {\n  font-weight: 500;\n}\n.QuestionReplyView_header,\n.QuestionReplyView_detail,\n.QuestionReplyView_options {\n  color: var(--cfg-muted);\n  font-size: 12px;\n}\n.QuestionReplyView_detail {\n  white-space: pre-wrap;\n}\n.QuestionReplyView_options {\n  display: grid;\n  gap: 4px;\n  margin: 4px 0 0;\n  padding: 0;\n  list-style: none;\n}\n.QuestionReplyView_options li {\n  display: flex;\n  align-items: flex-start;\n  gap: 6px;\n  padding: 6px;\n  border-radius: 6px;\n}\n.QuestionReplyView_options li[data-selected] {\n  color: var(--cfg-ink);\n  background: color-mix(in srgb, var(--cfg-accent) 9%, transparent);\n}\n.QuestionReplyView_selection {\n  display: grid;\n  place-items: center;\n  width: 16px;\n  height: 18px;\n  flex: none;\n  color: var(--cfg-accent-text);\n}\n.QuestionReplyView_optionCopy {\n  display: grid;\n  min-width: 0;\n  gap: 2px;\n}\n.QuestionReplyView_optionDescription {\n  color: var(--cfg-muted);\n}\n.QuestionReplyView_answer {\n  margin: 8px 0 0;\n  white-space: pre-wrap;\n}\n.QuestionReplyView_answerLabel {\n  margin-right: 4px;\n  color: var(--cfg-muted);\n  font-size: 12px;\n}\n.QuestionReplyView_actions {\n  display: flex;\n  align-items: center;\n  gap: 4px;\n  padding-right: 2px;\n  color: var(--dsw-alias-label-tertiary);\n}\n.QuestionReplyView_time {\n  font-size: 11px;\n  font-variant-numeric: tabular-nums;\n}\n.QuestionReplyView_action {\n  appearance: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  width: 28px;\n  height: 28px;\n  padding: 0;\n  border: 0;\n  border-radius: 6px;\n  background: transparent;\n  color: inherit;\n  cursor: pointer;\n}\n.QuestionReplyView_action svg {\n  width: 14px;\n  height: 14px;\n}\n.QuestionReplyView_action:hover:not(:disabled) {\n  background: var(--cfg-hover);\n  color: var(--cfg-ink);\n}\n.QuestionReplyView_action:focus-visible {\n  outline: 2px solid var(--cfg-accent);\n  outline-offset: 2px;\n}\n.QuestionReplyView_action:disabled {\n  opacity: .4;\n  cursor: default;\n}\n.QuestionReplyView_copyFeedback {\n  color: var(--cfg-muted);\n  font-size: 12px;\n}\n.QuestionReplyView_copyFeedback[role=alert] {\n  color: var(--dsw-alias-state-error-primary);\n}\n.QuestionReplyView_copyFeedback:empty {\n  display: none;\n}\n.QuestionReplyView_spinner {\n  width: 12px;\n  height: 12px;\n  border: 1px solid currentColor;\n  border-right-color: transparent;\n  border-radius: 50%;\n  animation: QuestionReplyView_spin 800ms linear infinite;\n}\n@keyframes QuestionReplyView_spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n.QuestionReplyView_question,\n.QuestionReplyView_answer,\n.QuestionReplyView_text {\n  min-width: 0;\n  overflow-wrap: anywhere;\n}\n@media (max-width: 640px) {\n  .QuestionReplyView_bubble {\n    max-width: 100%;\n  }\n  .QuestionReplyView_toggle {\n    min-height: 44px;\n  }\n  .QuestionReplyView_action {\n    width: 44px;\n    height: 44px;\n  }\n}\n@media (pointer: coarse) {\n  .QuestionReplyView_toggle {\n    min-height: 44px;\n  }\n  .QuestionReplyView_action {\n    width: 44px;\n    height: 44px;\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .QuestionReplyView_toggle {\n    transition: none;\n  }\n  .QuestionReplyView_spinner {\n    animation: none;\n  }\n}\n[data-ds-dark-theme] .QuestionReplyView_row {\n  --cfg-accent: var(--dsw-alias-state-business-primary, #4eb0e8);\n  --cfg-accent-text: color-mix(in srgb, var(--cfg-accent) 70%, var(--cfg-ink));\n}\n";
var id5 = "dsh-better-ask-user/QuestionReplyView.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(id5) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-better-ask-user";
  tag.dataset.pluginCss = id5;
  tag.textContent = css5;
  document.head.appendChild(tag);
}
var QuestionReplyView_default = {
  row: "QuestionReplyView_row",
  bubble: "QuestionReplyView_bubble",
  toggle: "QuestionReplyView_toggle",
  labelRow: "QuestionReplyView_labelRow",
  caret: "QuestionReplyView_caret",
  label: "QuestionReplyView_label",
  summary: "QuestionReplyView_summary",
  text: "QuestionReplyView_text",
  details: "QuestionReplyView_details",
  question: "QuestionReplyView_question",
  questionText: "QuestionReplyView_questionText",
  header: "QuestionReplyView_header",
  detail: "QuestionReplyView_detail",
  options: "QuestionReplyView_options",
  selection: "QuestionReplyView_selection",
  optionCopy: "QuestionReplyView_optionCopy",
  optionDescription: "QuestionReplyView_optionDescription",
  answer: "QuestionReplyView_answer",
  answerLabel: "QuestionReplyView_answerLabel",
  actions: "QuestionReplyView_actions",
  time: "QuestionReplyView_time",
  action: "QuestionReplyView_action",
  copyFeedback: "QuestionReplyView_copyFeedback",
  spinner: "QuestionReplyView_spinner",
  spin: "QuestionReplyView_spin"
};
var css_modules_entry_default5 = QuestionReplyView_default;

// src/client/QuestionReplyView.tsx
var import_jsx_runtime5 = require("react/jsx-runtime");
var QuestionReplyView = (0, import_react5.memo)(function QuestionReplyView2({ node, t }) {
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(QuestionReplyBubble, { data: node.data, t });
});
function QuestionReplyBubble({ data, t }) {
  const label = t("reply.label");
  const [open, setOpen] = (0, import_react5.useState)(false);
  const toggleLabel = t(open ? "reply.close" : "reply.open");
  const summary = data.questions.length === 0 ? data.text : data.questions.flatMap((question) => replyAnswerValues(data, question.id)).join(", ");
  const copyText = replyClipboardText(data, t);
  const detailsId = (0, import_react5.useId)();
  const [copyState, setCopyState] = (0, import_react5.useState)("idle");
  const copyTimer = (0, import_react5.useRef)();
  (0, import_react5.useEffect)(() => () => {
    window.clearTimeout(copyTimer.current);
  }, []);
  const onCopy = (0, import_react5.useCallback)(async () => {
    if (copyState === "copying" || copyState === "copied") return;
    window.clearTimeout(copyTimer.current);
    setCopyState("copying");
    try {
      const ok = await (0, import_dsh_client_ui_primitives4.writeClipboard)(copyText);
      setCopyState(ok ? "copied" : "error");
      if (ok) copyTimer.current = window.setTimeout(() => {
        setCopyState("idle");
      }, 1500);
    } catch {
      setCopyState("error");
    }
  }, [copyState, copyText]);
  const copyLabel = copyState === "copied" ? t("copied") : t("copy");
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: css_modules_entry_default5.row, "data-question-reply": data.callId, "data-reply-outcome": data.outcome, role: "group", "aria-label": label, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: css_modules_entry_default5.bubble, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
        "button",
        {
          type: "button",
          className: css_modules_entry_default5.toggle,
          "aria-expanded": open,
          "aria-controls": open ? detailsId : void 0,
          "aria-label": `${label} \xB7 ${toggleLabel}`,
          onClick: () => {
            setOpen((value) => !value);
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: css_modules_entry_default5.labelRow, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: css_modules_entry_default5.caret, "aria-hidden": "true", children: open ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconChevronDownOutlineRegular, {}) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconChevronRightOutlineRegular, {}) }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: css_modules_entry_default5.label, children: label })
            ] }),
            !open && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: css_modules_entry_default5.summary, children: summary === "" ? t("reply.skipped") : summary })
          ]
        }
      ),
      open && (data.questions.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("p", { className: css_modules_entry_default5.text, id: detailsId, children: data.text }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("dl", { className: css_modules_entry_default5.details, id: detailsId, children: data.questions.map((question) => {
        const values = replyAnswerValues(data, question.id);
        return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dt", { className: css_modules_entry_default5.question, children: [
            question.header && question.header !== question.question && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: css_modules_entry_default5.header, children: question.header }),
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: css_modules_entry_default5.questionText, children: question.question }),
            question.detail && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: css_modules_entry_default5.detail, children: question.detail }),
            question.options && question.options.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("ul", { className: css_modules_entry_default5.options, children: question.options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("li", { "data-selected": values.includes(option.label) || void 0, children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: css_modules_entry_default5.selection, "aria-hidden": "true", children: values.includes(option.label) ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconCheckOutlineRegular, { size: 12 }) : null }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { className: css_modules_entry_default5.optionCopy, children: [
                /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { children: option.label }),
                option.description && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: css_modules_entry_default5.optionDescription, children: option.description })
              ] })
            ] }, option.label)) })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("dd", { className: css_modules_entry_default5.answer, children: [
            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: css_modules_entry_default5.answerLabel, children: t("reply.answerLabel") }),
            values.length === 0 ? t("reply.skipped") : values.join(", ")
          ] })
        ] }, question.id);
      }) }))
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { className: css_modules_entry_default5.actions, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: css_modules_entry_default5.time, children: new Intl.DateTimeFormat(void 0, { hour: "2-digit", minute: "2-digit", hour12: false }).format(data.time) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.Tooltip, { label: copyLabel, side: "bottom", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("button", { type: "button", className: css_modules_entry_default5.action, "aria-label": copyLabel, "aria-busy": copyState === "copying", disabled: copyState === "copying", onClick: () => {
        void onCopy();
      }, children: copyState === "copying" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: css_modules_entry_default5.spinner, "aria-hidden": "true" }) : copyState === "copied" ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconCheckOutlineRegular, {}) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(import_dsh_client_ui_primitives4.IconCopyOutlineRegular, {}) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { className: css_modules_entry_default5.copyFeedback, role: copyState === "error" ? "alert" : "status", children: copyState === "error" ? t("reply.copyFailed") : copyState === "copied" ? t("copied") : null })
    ] })
  ] });
}

// src/client/locales.ts
var zh = {
  "error.incomplete": "\u8BF7\u5148\u5B8C\u6210\u8FD9\u9053\u95EE\u9898\u3002",
  "error.unanswered": "\u8BF7\u9009\u62E9\u4E00\u4E2A\u9009\u9879\u6216\u586B\u5199\u81EA\u5B9A\u4E49\u7B54\u6848\u3002",
  "error.unavailable": "\u5F53\u524D\u65E0\u6CD5\u63D0\u4EA4\uFF0C\u8BF7\u7A0D\u5019\u518D\u8BD5\u3002",
  "error.resubmit": "\u56DE\u7B54\u672A\u9001\u8FBE\uFF0C\u5DE5\u4F5C\u5DF2\u7EE7\u7EED\uFF0C\u8BF7\u518D\u63D0\u4EA4\u4E00\u6B21\u3002",
  "status.sent": "\u56DE\u7B54\u5DF2\u53D1\u9001\uFF1B\u9762\u677F\u672A\u80FD\u5173\u95ED\u3002",
  "history.title": "\u95EE\u9898",
  "history.review": "\u67E5\u770B",
  "history.reopen": "\u6253\u5F00",
  "history.interrupted": "\u5DF2\u4E2D\u65AD",
  "history.cancelled": "\u5DF2\u53D6\u6D88",
  "history.unavailable": "\u8FD9\u4E2A\u95EE\u9898\u5DF2\u7ED3\u675F\uFF0C\u65E0\u6CD5\u6253\u5F00\u3002",
  "reply.copyFailed": "\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  "wait.takeTime": "\u6162\u6162\u56DE\u7B54",
  "wait.countdown": "{seconds} \u79D2\u540E\u7EE7\u7EED\u5DE5\u4F5C",
  "wait.autoCountdown": "{seconds} \u79D2\u540E\u81EA\u52A8\u9009\u62E9\u9ED8\u8BA4\u9879",
  "wait.pauseLabel": "\u5DF2\u6682\u505C",
  "wait.paused": "\u5DF2\u6682\u505C \xB7 \u5269\u4F59 {seconds} \u79D2",
  "wait.held": "\u4F1A\u4E00\u76F4\u7B49\u4F60\u56DE\u7B54",
  "wait.extend": "\u8F93\u5165\u4F1A\u81EA\u52A8\u7EED\u671F",
  "wait.auto": "\u5230\u70B9\u5C06\u81EA\u52A8\u9009\u62E9\u9ED8\u8BA4\u9879",
  "wait.continued": "\u5DF2\u7EE7\u7EED\u5DE5\u4F5C\uFF0C\u4ECD\u53EF\u56DE\u7B54",
  "review.status": "\u5DF2\u56DE\u7B54",
  "review.unanswered": "\u672A\u6536\u5230\u56DE\u7B54",
  "review.skipped": "\u8FD9\u9053\u95EE\u9898\u5F53\u65F6\u88AB\u8DF3\u8FC7\u3002",
  "reply.label": "\u95EE\u9898\u56DE\u590D",
  "reply.open": "\u5C55\u5F00\u95EE\u9898\u8BE6\u60C5",
  "reply.close": "\u6536\u8D77\u95EE\u9898\u8BE6\u60C5",
  "reply.answerLabel": "\u56DE\u7B54\uFF1A",
  "reply.skipped": "\u5DF2\u8DF3\u8FC7",
  "nav.prev": "\u4E0A\u4E00\u9898",
  "nav.next": "\u4E0B\u4E00\u9898",
  "nav.minimize": "\u6536\u8D77\u95EE\u9898\u5361\u7247",
  "nav.maximize": "\u5C55\u5F00\u95EE\u9898\u5361\u7247",
  "nav.cancel": "\u653E\u5F03\u6574\u7EC4\u95EE\u9898",
  "nav.close": "\u6536\u8D77\u95EE\u9898\u9762\u677F\uFF0C\u53EF\u4ECE\u5DE5\u5177\u8C03\u7528\u91CD\u65B0\u6253\u5F00",
  "option.recommended": "\u63A8\u8350",
  "custom.placeholder": "\u8F93\u5165\u4F60\u7684\u7B54\u6848",
  "action.skip": "\u8DF3\u8FC7",
  "action.next": "\u4E0B\u4E00\u9898",
  "plan.header": "\u8BA1\u5212\u5F85\u5BA1",
  "plan.approve": "\u540C\u610F\u6267\u884C",
  "plan.decline": "\u62D2\u7EDD",
  "plan.discuss": "\u8981\u6C42\u4FEE\u6539"
};
var en = {
  "error.incomplete": "Please complete this question first.",
  "error.unanswered": "Please select an option or enter a custom answer.",
  "error.unavailable": "Cannot submit right now; try again in a moment.",
  "error.resubmit": "The answer did not arrive before work continued; submit it again.",
  "status.sent": "Reply sent; the panel could not close.",
  "history.title": "Question",
  "history.review": "Review",
  "history.reopen": "Open",
  "history.interrupted": "Interrupted",
  "history.cancelled": "Cancelled",
  "history.unavailable": "This question has ended and cannot be reopened.",
  "reply.copyFailed": "Copy failed. Try again.",
  "wait.takeTime": "Take time",
  "wait.countdown": "Continuing in {seconds}s",
  "wait.autoCountdown": "Defaults selected in {seconds}s",
  "wait.pauseLabel": "Paused",
  "wait.paused": "Paused \xB7 {seconds}s remaining",
  "wait.held": "Waiting until you answer",
  "wait.extend": "Typing extends the wait",
  "wait.auto": "Auto-selects defaults at timeout",
  "wait.continued": "Work continued \u2014 you can still answer",
  "review.status": "Answered",
  "review.unanswered": "No answer recorded",
  "review.skipped": "This question was skipped.",
  "reply.label": "Question reply",
  "reply.open": "Open question details",
  "reply.close": "Close question details",
  "reply.answerLabel": "Answer: ",
  "reply.skipped": "Skipped",
  "nav.prev": "Previous question",
  "nav.next": "Next question",
  "nav.minimize": "Collapse the question card",
  "nav.maximize": "Expand the question card",
  "nav.cancel": "Dismiss all questions",
  "nav.close": "Close the panel \u2014 reopen it from the tool call",
  "option.recommended": "Recommended",
  "custom.placeholder": "Type your answer",
  "action.skip": "Skip",
  "action.next": "Next",
  "plan.header": "Plan review",
  "plan.approve": "Approve",
  "plan.decline": "Refuse",
  "plan.discuss": "Request changes"
};

// src/client/settings.tsx
var import_react6 = require("react");

// src/client/settings-locales.ts
var settingsZh = {
  summary: "\u7B49\u5F85\u4E0E\u8D85\u65F6",
  title: "\u63D0\u95EE",
  purpose: "\u8BBE\u7F6E\u7B49\u5F85\u56DE\u7B54\u7684\u65F6\u957F\uFF0C\u4EE5\u53CA\u5230\u671F\u540E\u5982\u4F55\u5904\u7406\u95EE\u9898\u3002",
  waitLabel: "\u7B49\u5F85\u56DE\u7B54",
  durationLabel: "\u7B49\u5F85\u65F6\u957F\uFF08\u79D2\uFF09",
  presetLabel: "\u5FEB\u6377\u65F6\u957F",
  timed: "\u5012\u8BA1\u65F6",
  unlimited: "\u4E0D\u9650\u65F6",
  seconds: "\u79D2",
  secondShort: "\u79D2",
  minuteShort: "\u5206",
  waitHint: "\u8F93\u5165\u65F6\u91CD\u65B0\u8BA1\u65F6\u3002",
  unlimitedHint: "\u4E00\u76F4\u7B49\u5F85\u56DE\u7B54\uFF0C\u4E0D\u89E6\u53D1\u8D85\u65F6\u64CD\u4F5C\u3002",
  timelineAsk: "\u63D0\u95EE\u53D1\u51FA",
  timelineWait: "\u7B49\u5F85",
  timelineEnd: "\u5230\u671F",
  timeoutTitle: "\u5230\u671F\u540E",
  goalBehaviorLabel: "\u76EE\u6807\u8FDB\u884C\u4E2D",
  native: "\u4FDD\u6301\u95EE\u9898\u5F00\u653E",
  default: "\u63D0\u4EA4\u9ED8\u8BA4\u7B54\u6848",
  nativeHint: "\u5230\u671F\u540E\u95EE\u9898\u4ECD\u53EF\u56DE\u7B54\uFF0C\u7EE7\u7EED\u72EC\u7ACB\u5DE5\u4F5C\uFF0C\u4E0D\u81EA\u52A8\u6279\u51C6\u3002",
  defaultHint: "\u4EC5\u5BF9\u6709\u9ED8\u8BA4\u7B54\u6848\u7684\u95EE\u9898\u751F\u6548\uFF1B\u81EA\u52A8\u9009\u62E9\u4F1A\u88AB\u6807\u8BB0\uFF1B\u6CA1\u6709\u9ED8\u8BA4\u7B54\u6848\u65F6\u4FDD\u6301\u5F00\u653E\u3002",
  goalExplain: "\u76EE\u6807\u8FD0\u884C\u65F6\u63D0\u95EE\u53EF\u80FD\u963B\u585E\u7EED\u8DD1\uFF1B\u8FD9\u91CC\u5355\u72EC\u8BBE\u7F6E\u5230\u671F\u884C\u4E3A\u3002",
  discard: "\u653E\u5F03\u6539\u52A8",
  readonly: "\u5F53\u524D\u8BBE\u7F6E\u4E3A\u53EA\u8BFB\u3002",
  loading: "\u6B63\u5728\u8BFB\u53D6\u8BBE\u7F6E\u2026",
  unavailable: "\u5F53\u524D\u8FDE\u63A5\u4E0B\u65E0\u6CD5\u4F7F\u7528\u8FD9\u4E9B\u8BBE\u7F6E\u3002",
  waiting: "\u6B63\u5728\u7B49\u5F85\u8BBE\u7F6E\u2026",
  invalidWait: "\u7B49\u5F85\u65F6\u957F\u987B\u4E3A 1 \u5230 2147483 \u7684\u6574\u6570\u3002",
  save: "\u4FDD\u5B58",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  saved: "\u5DF2\u4FDD\u5B58\uFF0C\u5BF9\u65B0\u63D0\u95EE\u751F\u6548",
  conflict: "\u8BBE\u7F6E\u5DF2\u88AB\u5176\u4ED6\u7A97\u53E3\u4FEE\u6539\uFF0C\u8BF7\u91CD\u8BD5\u3002",
  saveFailed: "\u4FDD\u5B58\u5931\u8D25\uFF1A",
  dirty: "\u6709\u672A\u4FDD\u5B58\u7684\u4FEE\u6539"
};
var settingsEn = {
  summary: "Wait and timeout",
  title: "Questions",
  purpose: "Set how long questions wait and what happens when the wait ends.",
  waitLabel: "Wait for answers",
  durationLabel: "Wait duration in seconds",
  presetLabel: "Presets",
  timed: "Countdown",
  unlimited: "Unlimited",
  seconds: "sec",
  secondShort: "s",
  minuteShort: "m",
  waitHint: "Typing restarts the countdown.",
  unlimitedHint: "Wait until answered; no timeout action runs.",
  timelineAsk: "Question asked",
  timelineWait: "Wait",
  timelineEnd: "Timeout",
  timeoutTitle: "At timeout",
  goalBehaviorLabel: "Active goal",
  native: "Leave question open",
  default: "Submit defaults",
  nativeHint: "The question stays answerable after timeout; independent work continues. No automatic approval.",
  defaultHint: "Only questions with a default answer apply; automatic picks are marked. Without a default the question stays open.",
  goalExplain: "Questions during a goal can block resumption; set their timeout behavior separately here.",
  discard: "Discard",
  readonly: "These settings are read-only.",
  loading: "Loading settings\u2026",
  unavailable: "These settings are unavailable on the current connection.",
  waiting: "Waiting for settings\u2026",
  invalidWait: "Enter a whole number from 1 to 2147483 seconds.",
  save: "Save",
  saving: "Saving\u2026",
  saved: "Saved for new questions",
  conflict: "The settings changed in another window; try again.",
  saveFailed: "Save failed: ",
  dirty: "Unsaved changes"
};

// src/client/settings.module.css
var css6 = '/* src/client/settings.module.css */\n.settings_cfg {\n  --cfg-accent: var(--dsw-alias-state-business-primary, #3388bb);\n  --cfg-accent-text: color-mix(in srgb, var(--cfg-accent) 70%, var(--cfg-ink));\n  --cfg-solid: var(--dsw-alias-button-primary-fill, #20709e);\n  --cfg-solid-hover: color-mix(in srgb, var(--cfg-solid) 88%, var(--cfg-on-solid));\n  --cfg-on-solid: var(--dsw-alias-label-primary-foreground, #fff);\n  --cfg-ink: var(--dsw-alias-label-primary);\n  --cfg-muted: var(--dsw-alias-label-secondary);\n  --cfg-line: var(--dsw-alias-border-l2);\n  --cfg-surface: var(--dsw-alias-bg-layer-1);\n  --cfg-hover: var(--dsw-alias-interactive-bg-hover);\n  --cfg-danger: var(--dsw-alias-state-error-primary);\n  display: flex;\n  flex-direction: column;\n  gap: 20px;\n  width: 100%;\n  max-width: 960px;\n  margin: 0 auto;\n  min-width: 0;\n  color: var(--cfg-ink);\n  font: inherit;\n  font-size: 13px;\n  line-height: 20px;\n}\n.settings_cfg *,\n.settings_cfg {\n  box-sizing: border-box;\n}\n.settings_pageHead {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-start;\n  flex-wrap: wrap;\n  gap: 4px;\n  min-width: 0;\n}\n.settings_title {\n  flex: none;\n  margin: 0;\n  font-size: 20px;\n  line-height: 28px;\n  font-weight: 600;\n  letter-spacing: -.01em;\n}\n.settings_purpose {\n  flex: 0 0 auto;\n  min-width: 0;\n  margin: 0;\n  color: var(--cfg-muted);\n  font-size: 13px;\n  line-height: 20px;\n}\n.settings_badge {\n  flex: none;\n  display: inline-flex;\n  align-items: center;\n  height: 22px;\n  padding: 0 8px;\n  border: 1px solid var(--cfg-line);\n  border-radius: 8px;\n  color: var(--cfg-muted);\n  font-size: 12px;\n}\n.settings_note,\n.settings_status {\n  margin: 0;\n  color: var(--cfg-muted);\n  font-size: 12px;\n  overflow-wrap: anywhere;\n}\n.settings_group {\n  display: flex;\n  flex-direction: column;\n  min-width: 0;\n}\n.settings_section {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  padding: 12px 0;\n  min-width: 0;\n}\n.settings_section:first-child {\n  padding-top: 0;\n}\n.settings_section:last-child {\n  padding-bottom: 0;\n}\n.settings_waitHead {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  min-width: 0;\n}\n.settings_sectionLabel {\n  margin: 0;\n  color: color-mix(in srgb, var(--dsw-alias-label-tertiary) 80%, var(--cfg-ink));\n  font-size: 12px;\n  line-height: 20px;\n  font-weight: 500;\n}\n.settings_sectionNote {\n  margin: 0;\n  color: var(--cfg-muted);\n  font-size: 12px;\n  line-height: 18px;\n  overflow-wrap: anywhere;\n}\n.settings_choices {\n  display: inline-flex;\n  flex: none;\n  gap: 2px;\n  padding: 2px;\n  border: 1px solid var(--cfg-line);\n  border-radius: 8px;\n  background: color-mix(in srgb, var(--cfg-ink) 4%, var(--cfg-surface));\n}\n.settings_choice {\n  position: relative;\n  display: inline-flex;\n  min-width: 0;\n}\n.settings_choice input {\n  appearance: none;\n  position: absolute;\n  inset: 0;\n  width: 100%;\n  height: 100%;\n  margin: 0;\n  opacity: 0;\n  cursor: pointer;\n}\n.settings_choice span {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  height: 26px;\n  padding: 0 10px;\n  border: 1px solid transparent;\n  border-radius: 6px;\n  color: var(--cfg-muted);\n  font-size: 12px;\n  white-space: nowrap;\n}\n.settings_choice:has(input:checked) span {\n  border-color: var(--cfg-line);\n  background: var(--cfg-surface);\n  color: var(--cfg-accent-text);\n  font-weight: 500;\n}\n.settings_choice:has(input:hover:not(:disabled):not(:checked)) span {\n  background: var(--cfg-hover);\n}\n.settings_choice:has(input:focus-visible) {\n  outline: 2px solid var(--cfg-accent);\n  outline-offset: 2px;\n  border-radius: 6px;\n}\n.settings_choice:has(input:disabled) {\n  opacity: .4;\n}\n.settings_choice input:disabled {\n  cursor: not-allowed;\n}\n.settings_waitControl {\n  display: flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 12px;\n  min-width: 0;\n}\n.settings_duration {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  flex: none;\n}\n.settings_input {\n  appearance: none;\n  width: 132px;\n  height: 32px;\n  padding: 0 10px;\n  border: 1px solid var(--cfg-line);\n  border-radius: 8px;\n  background: var(--cfg-surface);\n  color: inherit;\n  font: inherit;\n  font-size: 16px;\n  font-weight: 500;\n  font-variant-numeric: tabular-nums;\n}\n.settings_input:hover:not(:disabled) {\n  border-color: color-mix(in srgb, var(--cfg-line) 55%, var(--cfg-ink));\n}\n.settings_input[aria-invalid=true] {\n  border-color: var(--cfg-danger);\n}\n.settings_input:focus-visible,\n.settings_chip:focus-visible {\n  outline: 2px solid var(--cfg-accent);\n  outline-offset: 1px;\n}\n.settings_input:disabled {\n  opacity: .4;\n  cursor: not-allowed;\n}\n.settings_unit {\n  color: var(--cfg-muted);\n  font-size: 12px;\n}\n.settings_presets {\n  display: inline-flex;\n  align-items: center;\n  flex-wrap: wrap;\n  gap: 6px;\n  min-width: 0;\n}\n.settings_chip {\n  appearance: none;\n  height: 32px;\n  padding: 0 10px;\n  border: 1px solid var(--cfg-line);\n  border-radius: 8px;\n  background: transparent;\n  color: var(--cfg-muted);\n  font: inherit;\n  font-size: 12px;\n  font-variant-numeric: tabular-nums;\n  cursor: pointer;\n}\n.settings_chip:hover:not(:disabled) {\n  background: var(--cfg-hover);\n  color: var(--cfg-ink);\n}\n.settings_chip[aria-pressed=true] {\n  border-color: var(--cfg-accent);\n  background: color-mix(in srgb, var(--cfg-accent) 8%, transparent);\n  color: var(--cfg-accent-text);\n  font-weight: 500;\n}\n.settings_chip:disabled {\n  opacity: .4;\n  cursor: not-allowed;\n}\n.settings_timeline {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  min-width: 0;\n  color: var(--cfg-muted);\n  font-size: 12px;\n  line-height: 18px;\n}\n.settings_timelineNode {\n  flex: none;\n  white-space: nowrap;\n}\n.settings_timelineRail {\n  position: relative;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  flex: 1;\n  min-width: 64px;\n  height: 1px;\n  background: var(--cfg-line);\n}\n.settings_timelineRail::after {\n  content: "";\n  position: absolute;\n  right: 0;\n  top: -3px;\n  width: 6px;\n  height: 6px;\n  border-top: 1px solid var(--cfg-line);\n  border-right: 1px solid var(--cfg-line);\n  transform: rotate(45deg);\n}\n.settings_timeline[data-unlimited=true] .settings_timelineRail::after {\n  display: none;\n}\n.settings_timelineChip {\n  position: relative;\n  z-index: 1;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  min-height: 24px;\n  padding: 0 8px;\n  border: 1px solid var(--cfg-line);\n  border-radius: 8px;\n  background: var(--cfg-surface);\n  color: var(--cfg-ink);\n  font-size: 12px;\n  font-variant-numeric: tabular-nums;\n  white-space: nowrap;\n}\n.settings_timeline[data-unlimited=true] .settings_timelineChip {\n  color: var(--cfg-muted);\n}\n.settings_fieldError {\n  margin: 0;\n  color: var(--cfg-danger);\n  font-size: 12px;\n  line-height: 18px;\n  overflow-wrap: anywhere;\n}\n.settings_cards {\n  display: grid;\n  grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 12px;\n  min-width: 0;\n}\n.settings_card {\n  position: relative;\n  display: grid;\n  grid-template-columns: minmax(0, 1fr) auto;\n  grid-template-areas: "head head" "desc diagram";\n  gap: 6px 12px;\n  padding: 12px;\n  border: 1px solid var(--cfg-line);\n  border-radius: 8px;\n  background: var(--cfg-surface);\n  cursor: pointer;\n}\n.settings_card:hover {\n  background: var(--cfg-hover);\n}\n.settings_card:has(input:checked),\n.settings_card:has(input:checked):hover {\n  border-color: var(--cfg-accent);\n  background: color-mix(in srgb, var(--cfg-accent) 6%, var(--cfg-surface));\n}\n.settings_card:has(input:focus-visible) {\n  outline: 2px solid var(--cfg-accent);\n  outline-offset: 2px;\n}\n.settings_card:has(input:disabled) {\n  opacity: .5;\n  cursor: not-allowed;\n}\n.settings_cardInput {\n  position: absolute;\n  width: 1px;\n  height: 1px;\n  margin: 0;\n  padding: 0;\n  opacity: 0;\n  pointer-events: none;\n}\n.settings_cardHead {\n  grid-area: head;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n}\n.settings_cardName {\n  min-width: 0;\n  overflow-wrap: anywhere;\n  font-size: 13px;\n  line-height: 20px;\n  font-weight: 500;\n}\n.settings_cardMark {\n  flex: none;\n  width: 16px;\n  height: 16px;\n  margin-left: auto;\n  border: 1px solid var(--dsw-alias-border-l4, var(--cfg-line));\n  border-radius: 50%;\n}\n.settings_cardMark::after {\n  content: "";\n  display: block;\n  width: 8px;\n  height: 8px;\n  margin: 3px;\n  border-radius: 50%;\n  background: var(--cfg-accent);\n  opacity: 0;\n}\n.settings_card:has(input:checked) .settings_cardMark {\n  border-color: var(--cfg-accent);\n}\n.settings_card:has(input:checked) .settings_cardMark::after {\n  opacity: 1;\n}\n.settings_cardDesc {\n  grid-area: desc;\n  min-width: 0;\n  color: var(--cfg-muted);\n  font-size: 12px;\n  line-height: 18px;\n  overflow-wrap: anywhere;\n}\n.settings_cardDiagram {\n  grid-area: diagram;\n  align-self: center;\n  display: block;\n  width: 104px;\n  max-width: 100%;\n  color: var(--cfg-muted);\n}\n.settings_cardDiagram svg {\n  display: block;\n  width: 100%;\n  height: auto;\n}\n.settings_card:has(input:checked) .settings_cardDiagram {\n  color: var(--cfg-accent);\n}\n.settings_footer {\n  position: sticky;\n  bottom: 0;\n  z-index: 1;\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  padding: 12px 0;\n  border-top: 1px solid var(--cfg-line);\n  background: var(--dsw-alias-bg-layer-1);\n}\n.settings_footer .settings_status {\n  flex: 1;\n  min-width: 0;\n}\n.settings_button,\n.settings_primary {\n  appearance: none;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  flex: none;\n  gap: 6px;\n  height: 32px;\n  padding: 0 12px;\n  border: 1px solid var(--cfg-line);\n  border-radius: 8px;\n  background: transparent;\n  color: inherit;\n  font: inherit;\n  font-size: 13px;\n  font-weight: 500;\n  cursor: pointer;\n}\n.settings_button:hover:not(:disabled) {\n  background: var(--cfg-hover);\n}\n.settings_primary {\n  min-width: 96px;\n  border-color: transparent;\n  background: var(--cfg-solid);\n  color: var(--cfg-on-solid);\n}\n.settings_primary:hover:not(:disabled) {\n  background: var(--cfg-solid-hover);\n}\n.settings_button:focus-visible,\n.settings_primary:focus-visible {\n  outline: 2px solid var(--cfg-accent);\n  outline-offset: 2px;\n}\n.settings_button:disabled,\n.settings_primary:disabled {\n  opacity: .4;\n  cursor: not-allowed;\n}\n.settings_button:active:not(:disabled),\n.settings_primary:active:not(:disabled) {\n  transform: translateY(1px);\n}\n.settings_spinner {\n  width: 12px;\n  height: 12px;\n  border: 1px solid currentColor;\n  border-right-color: transparent;\n  border-radius: 50%;\n  animation: settings_spin 800ms linear infinite;\n}\n@keyframes settings_spin {\n  to {\n    transform: rotate(360deg);\n  }\n}\n@media (max-width: 640px) {\n  .settings_waitHead {\n    align-items: stretch;\n    flex-direction: column;\n    gap: 8px;\n  }\n  .settings_choices {\n    width: 100%;\n  }\n  .settings_choice {\n    flex: 1;\n  }\n  .settings_choice span {\n    width: 100%;\n  }\n  .settings_waitControl {\n    align-items: stretch;\n    flex-direction: column;\n    gap: 8px;\n  }\n  .settings_duration,\n  .settings_presets {\n    width: 100%;\n  }\n  .settings_input {\n    flex: 1;\n    width: auto;\n    font-size: 16px;\n  }\n  .settings_cards {\n    grid-template-columns: minmax(0, 1fr);\n  }\n  .settings_chip,\n  .settings_input,\n  .settings_button,\n  .settings_primary,\n  .settings_choice span {\n    min-height: 44px;\n  }\n  .settings_section {\n    padding: 12px 0;\n  }\n  .settings_footer {\n    flex-wrap: wrap;\n  }\n  .settings_footer .settings_status {\n    flex-basis: 100%;\n  }\n}\n@media (pointer: coarse) {\n  .settings_chip,\n  .settings_input,\n  .settings_button,\n  .settings_primary,\n  .settings_choice span {\n    min-height: 44px;\n  }\n}\n@media (prefers-reduced-motion: reduce) {\n  .settings_spinner {\n    animation: none;\n  }\n  .settings_button:active:not(:disabled),\n  .settings_primary:active:not(:disabled) {\n    transform: none;\n  }\n}\n[data-ds-dark-theme] .settings_cfg {\n  --cfg-accent: var(--dsw-alias-state-business-primary, #4eb0e8);\n  --cfg-accent-text: color-mix(in srgb, var(--cfg-accent) 70%, var(--cfg-ink));\n  --cfg-solid: var(--dsw-alias-button-primary-fill, #4eb0e8);\n  --cfg-solid-hover: color-mix(in srgb, var(--cfg-solid) 88%, var(--cfg-on-solid));\n  --cfg-on-solid: var(--dsw-alias-label-primary-foreground, #0e1014);\n}\n';
var id6 = "dsh-better-ask-user/settings.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(id6) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "dsh-better-ask-user";
  tag.dataset.pluginCss = id6;
  tag.textContent = css6;
  document.head.appendChild(tag);
}
var settings_default = {
  cfg: "settings_cfg",
  pageHead: "settings_pageHead",
  title: "settings_title",
  purpose: "settings_purpose",
  badge: "settings_badge",
  note: "settings_note",
  status: "settings_status",
  group: "settings_group",
  section: "settings_section",
  waitHead: "settings_waitHead",
  sectionLabel: "settings_sectionLabel",
  sectionNote: "settings_sectionNote",
  choices: "settings_choices",
  choice: "settings_choice",
  waitControl: "settings_waitControl",
  duration: "settings_duration",
  input: "settings_input",
  chip: "settings_chip",
  unit: "settings_unit",
  presets: "settings_presets",
  timeline: "settings_timeline",
  timelineNode: "settings_timelineNode",
  timelineRail: "settings_timelineRail",
  timelineChip: "settings_timelineChip",
  fieldError: "settings_fieldError",
  cards: "settings_cards",
  card: "settings_card",
  cardInput: "settings_cardInput",
  cardHead: "settings_cardHead",
  cardName: "settings_cardName",
  cardMark: "settings_cardMark",
  cardDesc: "settings_cardDesc",
  cardDiagram: "settings_cardDiagram",
  footer: "settings_footer",
  button: "settings_button",
  primary: "settings_primary",
  spinner: "settings_spinner",
  spin: "settings_spin"
};
var css_modules_entry_default6 = settings_default;

// src/client/settings.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
var DEFAULTS = { questionTimeoutSeconds: 120, timeoutBehavior: "native", goalTimeoutBehavior: "native" };
var MAX_QUESTION_TIMEOUT_SECONDS = 2147483;
var fallbackT = (key) => settingsEn[key];
function normalize(value) {
  const seconds = value?.questionTimeoutSeconds;
  return {
    questionTimeoutSeconds: seconds === -1 || Number.isInteger(seconds) && seconds >= 1 && seconds <= MAX_QUESTION_TIMEOUT_SECONDS ? seconds : DEFAULTS.questionTimeoutSeconds,
    timeoutBehavior: value?.timeoutBehavior === "default" ? "default" : "native",
    goalTimeoutBehavior: value?.goalTimeoutBehavior === "default" ? "default" : "native"
  };
}
function toDraft(value) {
  return {
    questionTimeoutSeconds: String(value.questionTimeoutSeconds),
    timeoutBehavior: value.timeoutBehavior,
    goalTimeoutBehavior: value.goalTimeoutBehavior
  };
}
function parseSeconds(text) {
  const trimmed = text.trim();
  if (trimmed === "-1") return -1;
  if (!/^[0-9]+$/.test(trimmed)) return void 0;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) && value >= 1 && value <= MAX_QUESTION_TIMEOUT_SECONDS ? value : void 0;
}
function same(left, right) {
  return left.questionTimeoutSeconds === right.questionTimeoutSeconds && left.timeoutBehavior === right.timeoutBehavior && left.goalTimeoutBehavior === right.goalTimeoutBehavior;
}
function parseDraft(draft) {
  const seconds = parseSeconds(draft.questionTimeoutSeconds);
  if (seconds === void 0) return void 0;
  return { questionTimeoutSeconds: seconds, timeoutBehavior: draft.timeoutBehavior, goalTimeoutBehavior: draft.goalTimeoutBehavior };
}
function Choices({ id: id7, value, options, disabled, describedBy, onChange }) {
  const name = (0, import_react6.useId)();
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: css_modules_entry_default6.choices, id: id7, role: "radiogroup", "aria-labelledby": `${id7}-label`, "aria-disabled": disabled, children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: css_modules_entry_default6.choice, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      "input",
      {
        id: `${id7}-${option.value}`,
        type: "radio",
        name,
        value: option.value,
        checked: value === option.value,
        disabled,
        "aria-describedby": describedBy,
        onChange: () => {
          onChange(option.value);
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: option.label })
  ] }, option.value)) });
}
function ChoiceCards({ id: id7, value, options, disabled, describedBy, onChange }) {
  const name = (0, import_react6.useId)();
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: css_modules_entry_default6.cards, id: id7, role: "radiogroup", "aria-labelledby": `${id7}-label`, "aria-describedby": describedBy, "aria-disabled": disabled, children: options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("label", { className: css_modules_entry_default6.card, "data-choice": option.value, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      "input",
      {
        id: `${id7}-${option.value}`,
        className: css_modules_entry_default6.cardInput,
        type: "radio",
        name,
        value: option.value,
        checked: value === option.value,
        disabled,
        "aria-describedby": `${id7}-${option.value}-desc`,
        onChange: () => {
          onChange(option.value);
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: css_modules_entry_default6.cardHead, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: css_modules_entry_default6.cardName, children: option.label }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: css_modules_entry_default6.cardMark, "aria-hidden": "true" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: css_modules_entry_default6.cardDesc, id: `${id7}-${option.value}-desc`, children: option.description }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: css_modules_entry_default6.cardDiagram, "aria-hidden": "true", children: option.diagram })
  ] }, option.value)) });
}
function OpenFlow() {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("svg", { viewBox: "0 0 104 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("rect", { x: "1", y: "5", width: "24", height: "14", rx: "3" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { d: "M7 10h12M7 14h7", strokeWidth: "1" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { d: "M27 12h14" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("circle", { cx: "47", cy: "12", r: "4" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { d: "M51 12h14" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { d: "m61 8 4 4-4 4" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { d: "M71 7v10M78 7v10M85 7v10", strokeWidth: "1" })
  ] });
}
function DefaultFlow() {
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("svg", { viewBox: "0 0 104 24", fill: "none", stroke: "currentColor", strokeWidth: "1.5", "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("rect", { x: "1", y: "5", width: "24", height: "14", rx: "3" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { d: "M7 10h12M7 14h7", strokeWidth: "1" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { d: "M27 12h16" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("circle", { cx: "49", cy: "12", r: "4" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { d: "M53 12h16" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("circle", { cx: "78", cy: "12", r: "7" }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("path", { d: "m75 12 2 2 4-4" })
  ] });
}
function SettingsPage({ form, t = fallbackT }) {
  const state = form?.state;
  const revision = state?.revision;
  const host = state?.status === "ready" ? normalize(state.value) : null;
  const base = host === null ? null : toDraft(host);
  const [draft, setDraft] = (0, import_react6.useState)(null);
  const [busy, setBusy] = (0, import_react6.useState)(false);
  const [timedSeconds, setTimedSeconds] = (0, import_react6.useState)(String(DEFAULTS.questionTimeoutSeconds));
  const [notice, setNotice] = (0, import_react6.useState)(null);
  const live = draft !== null && draft.revision === revision ? draft.value : base;
  const parsed = live === null ? void 0 : parseDraft(live);
  const writable = state?.status === "ready" && state?.writable === true;
  const dirty = host !== null && (parsed === void 0 || !same(host, parsed));
  const edit = (0, import_react6.useCallback)((mutate) => {
    setNotice(null);
    if (base === null) return;
    setDraft((previous) => {
      const current = previous !== null && previous.revision === revision ? previous.value : base;
      return { revision: revision ?? 0, value: mutate(current) };
    });
  }, [base, revision]);
  const save = (0, import_react6.useCallback)(async () => {
    if (form === void 0 || host === null || parsed === void 0) return;
    if (!writable || busy || !dirty) return;
    const ops = [];
    if (host.questionTimeoutSeconds !== parsed.questionTimeoutSeconds) {
      ops.push({ op: "set", path: ["questionTimeoutSeconds"], value: parsed.questionTimeoutSeconds });
    }
    if (host.timeoutBehavior !== parsed.timeoutBehavior) {
      ops.push({ op: "set", path: ["timeoutBehavior"], value: parsed.timeoutBehavior });
    }
    if (host.goalTimeoutBehavior !== parsed.goalTimeoutBehavior) {
      ops.push({ op: "set", path: ["goalTimeoutBehavior"], value: parsed.goalTimeoutBehavior });
    }
    if (ops.length === 0) return;
    setBusy(true);
    setNotice(null);
    try {
      const accepted = await form.mutate(ops, revision);
      if (accepted) setNotice({ tone: "ok", text: t("saved") });
      else setNotice({ tone: "error", text: t("conflict") });
    } catch (error) {
      setNotice({ tone: "error", text: t("saveFailed") + String(error?.message ?? error) });
    } finally {
      setBusy(false);
    }
  }, [busy, dirty, form, host, parsed, revision, t, writable]);
  if (state === void 0) {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: css_modules_entry_default6.cfg, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: css_modules_entry_default6.note, role: "status", children: t("waiting") }) });
  }
  if (state.status === "loading") {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: css_modules_entry_default6.cfg, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: css_modules_entry_default6.note, role: "status", children: t("loading") }) });
  }
  if (host === null || live === null) {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: css_modules_entry_default6.cfg, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: css_modules_entry_default6.note, role: "alert", children: t("unavailable") }) });
  }
  const invalid = parsed === void 0;
  const unlimited = live.questionTimeoutSeconds === "-1";
  const controlsDisabled = !writable || busy;
  const seconds = parsed?.questionTimeoutSeconds;
  const waitAmount = unlimited ? "\u221E" : seconds === void 0 ? "\u2014" : `${t("timelineWait")} ${seconds} ${t("seconds")}`;
  const presets = [
    { seconds: 30, label: `30${t("secondShort")}` },
    { seconds: 120, label: `2${t("minuteShort")}` },
    { seconds: 300, label: `5${t("minuteShort")}` },
    { seconds: 600, label: `10${t("minuteShort")}` }
  ];
  const behaviorCards = [
    { value: "native", label: t("native"), description: t("nativeHint"), diagram: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(OpenFlow, {}) },
    { value: "default", label: t("default"), description: t("defaultHint"), diagram: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(DefaultFlow, {}) }
  ];
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: css_modules_entry_default6.cfg, "aria-busy": busy, "data-settings-dirty": dirty, "data-settings-busy": busy, children: [
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("header", { className: css_modules_entry_default6.pageHead, children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h2", { className: css_modules_entry_default6.title, id: "better-ask-user-title", children: t("title") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: css_modules_entry_default6.purpose, children: t("purpose") }),
      writable ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: css_modules_entry_default6.badge, role: "status", children: t("readonly") })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("section", { className: css_modules_entry_default6.group, "aria-label": t("title"), children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: css_modules_entry_default6.section, "data-ask-section": "wait", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: css_modules_entry_default6.waitHead, children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { className: css_modules_entry_default6.sectionLabel, id: "better-ask-user-wait-mode-label", children: t("waitLabel") }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            Choices,
            {
              id: "better-ask-user-wait-mode",
              value: unlimited ? "unlimited" : "timed",
              options: [{ value: "timed", label: t("timed") }, { value: "unlimited", label: t("unlimited") }],
              disabled: controlsDisabled,
              describedBy: "better-ask-user-wait-hint",
              onChange: (value) => {
                const nextUnlimited = value === "unlimited";
                if (nextUnlimited && !invalid) setTimedSeconds(live.questionTimeoutSeconds);
                edit((current) => ({ ...current, questionTimeoutSeconds: nextUnlimited ? "-1" : timedSeconds }));
              }
            }
          )
        ] }),
        unlimited ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: css_modules_entry_default6.waitControl, children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("span", { className: css_modules_entry_default6.duration, children: [
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
              "input",
              {
                id: "better-ask-user-wait",
                className: css_modules_entry_default6.input,
                "aria-label": t("durationLabel"),
                "aria-describedby": invalid ? "better-ask-user-error" : "better-ask-user-wait-hint",
                type: "text",
                inputMode: "numeric",
                "aria-invalid": invalid || void 0,
                value: live.questionTimeoutSeconds,
                disabled: controlsDisabled,
                onChange: (event) => {
                  edit((current) => ({ ...current, questionTimeoutSeconds: event.target.value }));
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: css_modules_entry_default6.unit, children: t("seconds") })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("div", { className: css_modules_entry_default6.presets, role: "group", "aria-label": t("presetLabel"), children: presets.map((preset) => /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
            "button",
            {
              type: "button",
              className: css_modules_entry_default6.chip,
              "data-preset": preset.seconds,
              "aria-pressed": seconds === preset.seconds,
              disabled: controlsDisabled,
              onClick: () => {
                edit((current) => ({ ...current, questionTimeoutSeconds: String(preset.seconds) }));
              },
              children: preset.label
            },
            preset.seconds
          )) })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: css_modules_entry_default6.timeline, "data-unlimited": unlimited, "aria-hidden": "true", children: [
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: css_modules_entry_default6.timelineNode, children: t("timelineAsk") }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: css_modules_entry_default6.timelineRail, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: css_modules_entry_default6.timelineChip, children: waitAmount }) }),
          /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: css_modules_entry_default6.timelineNode, children: unlimited ? t("unlimited") : t("timelineEnd") })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: css_modules_entry_default6.sectionNote, id: "better-ask-user-wait-hint", children: t(unlimited ? "unlimitedHint" : "waitHint") }),
        invalid && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: css_modules_entry_default6.fieldError, id: "better-ask-user-error", role: "alert", children: t("invalidWait") })
      ] }),
      unlimited ? null : /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: css_modules_entry_default6.section, "data-ask-section": "timeout", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { className: css_modules_entry_default6.sectionLabel, id: "better-ask-user-behavior-label", children: t("timeoutTitle") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          ChoiceCards,
          {
            id: "better-ask-user-behavior",
            value: live.timeoutBehavior,
            options: behaviorCards,
            disabled: controlsDisabled,
            onChange: (value) => {
              edit((current) => ({ ...current, timeoutBehavior: value }));
            }
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: css_modules_entry_default6.section, "data-ask-section": "goal", children: [
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("h3", { className: css_modules_entry_default6.sectionLabel, id: "better-ask-user-goal-behavior-label", children: t("goalBehaviorLabel") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: css_modules_entry_default6.sectionNote, id: "better-ask-user-goal-hint", children: t("goalExplain") }),
        /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
          ChoiceCards,
          {
            id: "better-ask-user-goal-behavior",
            value: live.goalTimeoutBehavior,
            options: behaviorCards,
            disabled: controlsDisabled,
            describedBy: "better-ask-user-goal-hint",
            onChange: (value) => {
              edit((current) => ({ ...current, goalTimeoutBehavior: value }));
            }
          }
        )
      ] })
    ] }),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("p", { className: notice.tone === "ok" ? css_modules_entry_default6.status : css_modules_entry_default6.fieldError, role: notice.tone === "error" ? "alert" : "status", children: notice.text }),
    dirty && /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)("div", { className: css_modules_entry_default6.footer, id: "better-ask-user-settings-footer", children: [
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: css_modules_entry_default6.status, children: t("dirty") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("button", { type: "button", className: css_modules_entry_default6.button, id: "better-ask-user-discard", disabled: controlsDisabled, onClick: () => {
        setDraft(null);
        setNotice(null);
        setTimedSeconds(String(host.questionTimeoutSeconds === -1 ? DEFAULTS.questionTimeoutSeconds : host.questionTimeoutSeconds));
      }, children: t("discard") }),
      /* @__PURE__ */ (0, import_jsx_runtime6.jsxs)(
        "button",
        {
          type: "button",
          className: css_modules_entry_default6.primary,
          "data-settings-save": true,
          disabled: controlsDisabled || invalid,
          "aria-busy": busy,
          onClick: () => {
            void save();
          },
          children: [
            busy && /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { className: css_modules_entry_default6.spinner, "aria-hidden": "true" }),
            busy ? t("saving") : t("save")
          ]
        }
      )
    ] })
  ] });
}
function SettingsEntry(props) {
  const t = props.t ?? fallbackT;
  if (props.view === "summary") return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)("span", { children: t("summary") });
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(SettingsPage, { form: props.form, t });
}

// src/client/index.ts
var NS = "question";
var inject = ["sessions", "remote", "remote.userQuestions", "uiSession", "slots", "locale", "uiConversation"];
var QuestionCards = class {
  constructor(publish) {
    this.publish = publish;
  }
  #cards = /* @__PURE__ */ new Map();
  #presenceSources = /* @__PURE__ */ new Map();
  #presenceListeners = /* @__PURE__ */ new Set();
  byCallId(sessionId, callId) {
    return this.#cards.get(PendingQuestion.keyOf(sessionId, callId));
  }
  /** Observable state for one card while the registry owns it. */
  source(key) {
    return this.#cards.get(key)?.pending;
  }
  /**
   * Observable existence of one tool call's card. The transcript row offers
   * reopening only while the registry still holds that card; a removed card
   * flips the snapshot so the stale affordance disappears with it.
   * @param sessionId - owning Session.
   * @param callId - tool call identity as the transcript row spells it.
   * @returns a stable source that notifies when the card is added or removed.
   */
  presence(sessionId, callId) {
    const key = PendingQuestion.keyOf(sessionId, callId);
    let source = this.#presenceSources.get(key);
    if (source === void 0) {
      source = {
        getSnapshot: () => this.#cards.has(key),
        subscribe: (listener) => {
          this.#presenceListeners.add(listener);
          return () => {
            this.#presenceListeners.delete(listener);
          };
        }
      };
      this.#presenceSources.set(key, source);
    }
    return source;
  }
  #publishPresence() {
    for (const listener of [...this.#presenceListeners]) listener();
  }
  values() {
    return [...this.#cards.values()];
  }
  /** Keys of every card registered for one Session. */
  keysFor(sessionId) {
    return this.values().filter((card) => card.pending.sessionId === sessionId).map((card) => card.pending.key);
  }
  /**
   * Return the card of a tool call, creating and publishing it when absent.
   * A request without a call id always gets a fresh card.
   */
  ensure(sessionId, questions, callId, settings) {
    if (callId !== void 0) {
      const existing = this.byCallId(sessionId, callId);
      if (existing !== void 0) {
        if (settings !== void 0) existing.pending.configure(settings);
        return existing;
      }
    }
    return this.#create(new PendingQuestion(sessionId, questions, callId, () => this.keysFor(sessionId), void 0, settings));
  }
  /** Publish one carrier into the composer seat and register the card that owns it. */
  #create(pending) {
    const requests = /* @__PURE__ */ new Set();
    const delegate = async () => {
      pending.delegate();
      await Promise.all(requests);
    };
    let unpublish = this.publish(pending, delegate);
    const card = {
      pending,
      hide: () => {
        unpublish?.();
        unpublish = void 0;
      },
      reveal: () => {
        unpublish?.();
        unpublish = this.publish(pending, delegate);
      },
      remove: () => {
        if (this.#cards.get(pending.key) !== card) return;
        this.#cards.delete(pending.key);
        this.#publishPresence();
        pending.close();
        unpublish?.();
        unpublish = void 0;
      },
      trackRequest: (completion) => {
        requests.add(completion);
        return () => {
          requests.delete(completion);
        };
      },
      hasRequest: () => requests.size > 0
    };
    pending.attachSeat({ hide: pending.review === void 0 ? card.hide : card.remove });
    this.#cards.set(pending.key, card);
    this.#publishPresence();
    return card;
  }
  /**
   * Show the panel of one answerable tool call.
   * @param sessionId - Session the tool call belongs to.
   * @param callId - `ask_user_question` call whose panel to show, as its
   * transcript row spells it.
   * @returns whether a card for that call is still answerable.
   */
  reveal(sessionId, callId) {
    const card = this.byCallId(sessionId, callId);
    if (card === void 0) return false;
    card.reveal();
    return true;
  }
  /**
   * Show one settled tool call's recorded answers as a read-only card. A call
   * that somehow still holds a card is shown as it stands, so a live request is
   * never replaced by a stale copy of itself.
   * @param sessionId - Session the tool call belongs to.
   * @param callId - `ask_user_question` call whose record to show, as its
   * transcript row spells it.
   * @param record - the call's questions and recorded answers.
   * @returns true; a record always produces a card.
   */
  review(sessionId, callId, record) {
    const card = this.byCallId(sessionId, callId) ?? this.#create(new PendingQuestion(
      sessionId,
      record.questions,
      brandString(callId),
      () => this.keysFor(sessionId),
      record.answers
    ));
    card.reveal();
    return true;
  }
  /**
   * Hand every live waterfall back at plugin teardown. The pending-interaction
   * registry only drains what it currently holds, and a hidden card is not in
   * it, so its Host request would wait for its own abort instead.
   */
  dispose() {
    for (const card of this.values()) {
      card.pending.delegate();
      card.remove();
    }
  }
};
async function answerQuestion(ctx, owner, request, next, cards) {
  const sessionId = ctx.sessions.scopeOf(owner);
  if (sessionId === void 0) return next();
  const callId = request.wait?.callId;
  const better = request.better;
  const card = cards.ensure(sessionId, request.questions, callId, better);
  const claimLifetime = new AbortController();
  const claimSignal = request.signal === void 0 ? claimLifetime.signal : AbortSignal.any([claimLifetime.signal, request.signal]);
  let claim;
  let claimEnded;
  let delegateRequest;
  const releaseClaim = request.wait?.timed === true && callId !== void 0 ? ctx.effect(() => {
    claim = ctx.remote.userQuestions.attachWait(sessionId, callId, claimSignal);
    return async () => {
      delegateRequest?.();
      claimLifetime.abort();
      claim?.dispose();
      if (claimEnded !== void 0) await Promise.allSettled([claimEnded]);
    };
  }, "ui-user-questions: foreground claim") : void 0;
  const completed = Promise.withResolvers();
  const finishRequest = card.trackRequest(completed.promise);
  try {
    const iterator = claim?.[Symbol.asyncIterator]();
    const opening = iterator === void 0 ? void 0 : await iterator.next();
    if (opening?.done === true) return await next();
    const waterfall = createWaterfallRequest(
      opening === void 0 ? void 0 : Date.now() + opening.value.remainingMs,
      claimSignal,
      (channel) => {
        card.pending.detachWaterfall(channel);
      }
    );
    if (claimSignal.aborted) return await waterfall.result;
    delegateRequest = () => {
      waterfall.channel.delegate();
    };
    card.pending.attachWaterfall(waterfall.channel);
    if (iterator !== void 0) {
      claimEnded = (async () => {
        await iterator.next();
        throw new Error("the foreground question wait ended");
      })();
    }
    try {
      return await (claimEnded === void 0 ? waterfall.result : Promise.race([waterfall.result, claimEnded]));
    } catch (error) {
      if (waterfall.isDelegation(error)) {
        await releaseClaim?.();
        return await next();
      }
      throw error;
    }
  } finally {
    if (releaseClaim === void 0) claimLifetime.abort();
    else if (claimEnded === void 0) await releaseClaim();
    else {
      void Promise.allSettled([claimEnded]).then(() => {
        void releaseClaim();
      });
    }
    if (callId === void 0) card.remove();
    completed.resolve();
    finishRequest();
  }
}
function publishContinuedQuestions(ctx, cards) {
  const sessions = ctx.sessions;
  const stopProjections = /* @__PURE__ */ new Map();
  const unwrap = (result) => {
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };
  const rpcFor = (sessionId, callId) => ({
    answer: async (answer) => unwrap(await ctx.remote.userQuestions.answer(sessionId, callId, answer))
  });
  const reconcile = () => {
    const snapshot = sessions.list.getSnapshot();
    const bound = new Map(Object.values(snapshot.byId).flatMap((summary) => {
      const binding = sessions.binding(summary.id);
      return binding === void 0 ? [] : [[summary.id, binding]];
    }));
    for (const [sessionId, stop] of stopProjections) {
      if (bound.has(sessionId)) continue;
      stop();
      stopProjections.delete(sessionId);
    }
    for (const [sessionId, binding] of bound) {
      if (stopProjections.has(sessionId)) continue;
      const stopQuestions = binding.session.projections.faceOf("userQuestions").subscribe(reconcile);
      const stopInbox = binding.session.projections.faceOf("inbox").subscribe(reconcile);
      stopProjections.set(sessionId, () => {
        stopQuestions();
        stopInbox();
      });
    }
    const rows = /* @__PURE__ */ new Map();
    for (const [sessionId, binding] of bound) {
      const projected = binding.session.projections.faceOf("userQuestions").getSnapshot();
      const inbox = binding.session.projections.faceOf("inbox").getSnapshot();
      const queued = /* @__PURE__ */ new Set();
      for (const message of [...inbox?.["next-step"] ?? [], ...inbox?.["next-turn"] ?? []]) {
        if (typeof message !== "object" || message === null || Array.isArray(message)) continue;
        const source = message.source;
        if (typeof source !== "object" || source === null || Array.isArray(source)) continue;
        if (source.kind === "user-question-reply" && typeof source.callId === "string") queued.add(source.callId);
      }
      for (const row of projected?.active ?? []) {
        if (row.state === "continued" && queued.has(row.callId)) continue;
        rows.set(PendingQuestion.keyOf(sessionId, row.callId), { sessionId, row });
      }
    }
    for (const { sessionId, row } of rows.values()) {
      if (row.state === "continued") {
        const card = cards.ensure(sessionId, row.questions, row.callId);
        card.pending.attachRpc(rpcFor(sessionId, row.callId));
        card.pending.setState("continued");
        continue;
      }
      cards.byCallId(sessionId, row.callId)?.pending.setState("open");
    }
    for (const card of cards.values()) {
      if (card.pending.callId === void 0 || card.pending.review !== void 0 || rows.has(card.pending.key) || card.hasRequest() || card.pending.hasWaterfall()) continue;
      card.remove();
    }
  };
  reconcile();
  const stopList = sessions.list.subscribe(reconcile);
  return () => {
    stopList();
    for (const stop of stopProjections.values()) stop();
    stopProjections.clear();
  };
}
var SETTINGS_NS = "better-ask-user-settings";
var ROW_CONFIG_KEYS = Object.freeze([
  "dsh-better-ask-user#dsh-better-ask-user",
  "dsh-better-dsh#dsh-better-ask-user",
  "@menghuan1918/dsh-apollo#dsh-better-ask-user",
  "dsh-apollo#dsh-better-ask-user"
]);
function apply(ctx) {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), "ui-user-questions: dictionaries");
  ctx.effect(() => ctx.locale.register(SETTINGS_NS, { zh: settingsZh, en: settingsEn }), "better-ask-user: settings dictionaries");
  ctx.effect(() => ctx.slots.inject("plugins.row.config", () => {
    const disposers = [];
    for (const key of ROW_CONFIG_KEYS) {
      try {
        const dispose = ctx.slots.register({
          name: "plugins.row.config",
          key,
          locale: SETTINGS_NS
        }, SettingsEntry);
        if (typeof dispose === "function") disposers.push(dispose);
      } catch {
      }
    }
    return () => {
      for (const dispose of disposers) dispose();
    };
  }), "better-ask-user: row config page");
  const questionDraftStore = createQuestionDraftStore();
  const registerPendingInteraction = ctx.uiSession.registerPendingInteraction(
    (pending) => pending.kind === "plan-review" ? 2 : 1
  );
  const cards = new QuestionCards(registerPendingInteraction);
  ctx.effect(() => () => {
    cards.dispose();
  }, "ui-user-questions: cards");
  const disposePanels = ctx.reflect.provide("userQuestionPanels", {
    reveal: (sessionId, callId) => cards.reveal(sessionId, callId),
    review: (sessionId, callId, record) => cards.review(sessionId, callId, record)
  });
  ctx.effect(() => disposePanels, "ui-user-questions: answer panels");
  ctx.effect(() => publishContinuedQuestions(ctx, cards), "ui-user-questions: continued questions");
  ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
    name: "tool.call.toolview",
    key: "ask_user_question",
    locale: NS,
    // The host already owns this key at priority 0; lower priority shadows it.
    priority: -1,
    inject: (sessionId) => ({
      revealPanel: (callId) => ctx.get("userQuestionPanels")?.reveal(sessionId, callId) ?? false,
      reviewPanel: (callId, record) => ctx.get("userQuestionPanels")?.review(sessionId, callId, record) ?? false,
      keyedHooks: {
        questionPanelLive: (callId) => cards.presence(sessionId, callId)
      }
    })
  }, AskHistoryRow));
  ctx.slots.inject("conversation.composer", () => ctx.slots.register(
    {
      name: "conversation.composer",
      select: ({ pendingInteraction }) => pendingInteraction instanceof PendingQuestion ? pendingInteraction : null,
      locale: NS,
      store: questionDraftStore,
      inject: () => ({ keyedHooks: { questionCard: (key) => cards.source(key) } }),
      children: { "conversation.plan-review.actions": { kind: "list", scope: "session" } }
    },
    QuestionComposer
  ));
  ctx.uiConversation.events.register(questionReplyDefinition);
  ctx.slots.inject("conversation.chat.node", () => ctx.slots.register({
    name: "conversation.chat.node",
    key: "question-reply",
    locale: NS
  }, QuestionReplyView));
  ctx.remote.$on("user-questions/request", function(request, next) {
    return answerQuestion(ctx, this, request, next, cards);
  });
}

    return module.exports;
  }
});
