import { getSigningCosmwasmClient } from "osmojs";
import { cosmwasm } from "osmojs";

const { executeContract } =
  cosmwasm.wasm.v1.MessageComposer.withTypeUrl;
const { MsgExecuteContract } = cosmwasm.wasm.v1;

// ── Config ──────────────────────────────────────────────────────────────────

const CONTRACT =
  "osmo1slqv7yv45v4k3ccrvwv24u2scqn6hyrut7j5m69ygw3j66ayqnesxemawx";
const RPC_ARCHIVE = "https://rpc.archive.osmosis.zone";
const RPC_BROADCAST = "https://rpc.osmosis.zone:443";
const LCD_ENDPOINT = "https://rest-osmosis.ecostake.com";
const CHAIN_ID = "osmosis-1";
const EXPLORER_TX = "https://www.mintscan.io/osmosis/tx/";

const DENOMS = {
  "ibc/D3B574938631B0A1BA704879020C696E514CFADAA7643CDE4BD5EB010BDE327B": {
    symbol: "PHMN",
    decimals: 6,
  },
  "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4": {
    symbol: "USDC",
    decimals: 6,
  },
  uosmo: { symbol: "OSMO", decimals: 6 },
};

// ── State ───────────────────────────────────────────────────────────────────

let walletAddress = null;
let connectedAddress = null;
let orders = [];
let txMap = {};

// ── DOM refs ────────────────────────────────────────────────────────────────

const elWalletInput = document.getElementById("walletAddress");
const elBtnLoad = document.getElementById("btnLoadOrders");
const elBtnKeplr = document.getElementById("btnConnectKeplr");
const elKeplrStatus = document.getElementById("keplrStatus");
const elOrdersSection = document.getElementById("ordersSection");
const elOrderCount = document.getElementById("orderCount");
const elOrdersBody = document.getElementById("ordersBody");
const elBtnSelectAll = document.getElementById("btnSelectAll");
const elBtnCancel = document.getElementById("btnCancelSelected");
const elCheckAll = document.getElementById("checkAll");
const elStatusPanel = document.getElementById("statusPanel");
const elLoadingMask = document.getElementById("loadingMask");
const elLoadingText = document.getElementById("loadingText");

// ── Helpers ─────────────────────────────────────────────────────────────────

function showLoading(msg) {
  elLoadingText.textContent = msg || "Loading...";
  elLoadingMask.classList.remove("hidden");
}

function hideLoading() {
  elLoadingMask.classList.add("hidden");
}

function showStatus(msg, type) {
  elStatusPanel.textContent = msg;
  elStatusPanel.className = "status-panel " + type;
  elStatusPanel.classList.remove("hidden");
}

function hideStatus() {
  elStatusPanel.classList.add("hidden");
}

function denomInfo(denom) {
  return DENOMS[denom] || { symbol: denom.slice(0, 12) + "...", decimals: 6 };
}

function formatQuantity(raw, decimals) {
  const val = parseInt(raw, 10) / Math.pow(10, decimals);
  return val.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

function formatTimestamp(nanoTimestamp) {
  if (!nanoTimestamp || nanoTimestamp === "0") return "—";
  const ms = Math.floor(parseInt(nanoTimestamp, 10) / 1e6);
  return new Date(ms).toLocaleString();
}

function shortHash(hash) {
  if (!hash) return "";
  return hash.slice(0, 8) + "..." + hash.slice(-6);
}

// ── LCD: Query contract state ───────────────────────────────────────────────

async function queryContract(queryMsg) {
  const json = JSON.stringify(queryMsg);
  const base64 = btoa(json);
  const url = `${LCD_ENDPOINT}/cosmwasm/wasm/v1/contract/${CONTRACT}/smart/${base64}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`LCD query failed: ${res.status}`);
  const body = await res.json();
  return body.data;
}

async function fetchOrdersByOwner(owner) {
  return queryContract({
    orders_by_owner: { owner, limit: 100 },
  });
}

async function fetchDenoms() {
  return queryContract({ denoms: {} });
}

// ── RPC Archive: Fetch tx history for enrichment ────────────────────────────

async function fetchPlaceLimitTxs(sender) {
  const query = encodeURIComponent(
    `message.sender='${sender}'`
  );
  const url = `${RPC_ARCHIVE}/tx_search?query=%22${query}%22&page=1&per_page=100&order_by=%22desc%22`;

  try {
    const res = await fetch(url);
    if (!res.ok) return {};
    const body = await res.json();
    const map = {};

    for (const tx of body.result.txs || []) {
      for (const event of tx.tx_result.events || []) {
        if (event.type !== "wasm") continue;
        let method = null;
        let orderId = null;
        let contractAddr = null;
        for (const attr of event.attributes) {
          const key = attr.key;
          const value = attr.value;
          if (key === "method") method = value;
          if (key === "order_id") orderId = value;
          if (key === "_contract_address") contractAddr = value;
        }
        if (
          method === "placeLimit" &&
          contractAddr === CONTRACT &&
          orderId
        ) {
          map[orderId] = {
            hash: tx.hash,
            height: tx.height,
          };
        }
      }
    }
    return map;
  } catch (e) {
    console.warn("Archive tx fetch failed:", e);
    return {};
  }
}

// ── Load and display orders ─────────────────────────────────────────────────

async function loadOrders() {
  walletAddress = elWalletInput.value.trim();
  if (!walletAddress || !walletAddress.startsWith("osmo1")) {
    showStatus("Please enter a valid Osmosis address (osmo1...)", "error");
    return;
  }

  hideStatus();
  showLoading("Fetching orders from contract...");

  try {
    const [orderData, denomData, placeTxs] = await Promise.all([
      fetchOrdersByOwner(walletAddress),
      fetchDenoms(),
      fetchPlaceLimitTxs(walletAddress),
    ]);

    orders = orderData.orders || [];
    txMap = placeTxs;

    if (orders.length === 0) {
      hideLoading();
      showStatus("No active orders found for this wallet.", "info");
      elOrdersSection.classList.add("hidden");
      return;
    }

    const baseDenom = denomData.base_denom;
    const quoteDenom = denomData.quote_denom;
    const baseInfo = denomInfo(baseDenom);
    const quoteInfo = denomInfo(quoteDenom);

    renderOrders(orders, baseInfo, quoteInfo);
    elOrdersSection.classList.remove("hidden");
    elOrderCount.textContent = orders.length;
    hideLoading();
    showStatus(
      `Found ${orders.length} active order(s). Pair: ${baseInfo.symbol}/${quoteInfo.symbol}`,
      "info"
    );
  } catch (err) {
    hideLoading();
    showStatus("Error loading orders: " + err.message, "error");
    console.error(err);
  }
}

function renderOrders(orderList, baseInfo) {
  elOrdersBody.innerHTML = "";

  for (const order of orderList) {
    const tr = document.createElement("tr");
    const txInfo = txMap[String(order.order_id)] || {};

    tr.innerHTML = `
      <td><input type="checkbox" class="order-check" data-tick="${order.tick_id}" data-order="${order.order_id}" /></td>
      <td>${order.order_id}</td>
      <td class="direction-${order.order_direction}">${order.order_direction.toUpperCase()}</td>
      <td>${formatQuantity(order.quantity, baseInfo.decimals)} ${baseInfo.symbol}</td>
      <td>${order.tick_id}</td>
      <td>${formatTimestamp(order.placed_at)}</td>
      <td>${
        txInfo.hash
          ? `<a class="tx-link" href="${EXPLORER_TX}${txInfo.hash}" target="_blank" rel="noopener">${shortHash(txInfo.hash)}</a>`
          : "—"
      }</td>
    `;
    elOrdersBody.appendChild(tr);
  }

  updateCancelButton();
}

// ── Selection handling ──────────────────────────────────────────────────────

function getSelectedOrders() {
  const checks = document.querySelectorAll(".order-check:checked");
  return Array.from(checks).map((cb) => ({
    tick_id: parseInt(cb.dataset.tick, 10),
    order_id: parseInt(cb.dataset.order, 10),
  }));
}

function updateCancelButton() {
  const selected = getSelectedOrders();
  elBtnCancel.disabled = selected.length === 0;
  elBtnCancel.textContent =
    selected.length > 0
      ? `Cancel Selected (${selected.length})`
      : "Cancel Selected";
}

// ── Keplr wallet connection ─────────────────────────────────────────────────

async function connectKeplr() {
  if (!window.keplr) {
    showStatus(
      "Keplr wallet extension not found. Please install it from keplr.app",
      "error"
    );
    return;
  }

  try {
    await window.keplr.enable(CHAIN_ID);
    const offlineSigner = await window.getOfflineSignerAuto(CHAIN_ID);
    const accounts = await offlineSigner.getAccounts();
    connectedAddress = accounts[0].address;

    elKeplrStatus.textContent = connectedAddress.slice(0, 12) + "...";
    elKeplrStatus.className = "status-badge status-connected";
    showStatus("Keplr connected: " + connectedAddress, "success");
  } catch (err) {
    showStatus("Keplr connection failed: " + err.message, "error");
  }
}

// ── Cancel orders ───────────────────────────────────────────────────────────

async function cancelSelectedOrders() {
  const selected = getSelectedOrders();
  if (selected.length === 0) {
    showStatus("No orders selected.", "error");
    return;
  }

  if (!connectedAddress) {
    showStatus("Please connect Keplr wallet first.", "error");
    return;
  }

  walletAddress = elWalletInput.value.trim();
  if (connectedAddress !== walletAddress) {
    showStatus(
      `Connected wallet (${connectedAddress}) does not match the lookup address (${walletAddress}). You can only cancel your own orders.`,
      "error"
    );
    return;
  }

  const count = selected.length;
  if (!confirm(`Cancel ${count} order(s)? This action is irreversible.`)) {
    return;
  }

  showLoading(`Cancelling ${count} order(s)...`);

  try {
    const offlineSigner = await window.getOfflineSignerAuto(CHAIN_ID);
    const client = await getSigningCosmwasmClient({
      rpcEndpoint: RPC_BROADCAST,
      signer: offlineSigner,
    });

    const msgs = selected.map((sel) => {
      const msgValue = MsgExecuteContract.fromAmino({
        sender: connectedAddress,
        contract: CONTRACT,
        msg: {
          cancel_limit: {
            tick_id: sel.tick_id,
            order_id: sel.order_id,
          },
        },
        funds: [],
      });
      return executeContract(msgValue);
    });

    const gasFee = {
      amount: [{ amount: String(10000 * count), denom: "uosmo" }],
      gas: String(200000 * count),
    };

    const result = await client.signAndBroadcast(
      connectedAddress,
      msgs,
      gasFee,
      "Cancel limit orders via osmosis-cancel-limitorders"
    );

    hideLoading();

    if (result.code === 0) {
      showStatus(
        `Successfully cancelled ${count} order(s). TX: ${result.transactionHash}`,
        "success"
      );
      setTimeout(() => loadOrders(), 3000);
    } else {
      showStatus(
        `Transaction failed (code ${result.code}): ${result.rawLog}`,
        "error"
      );
    }
  } catch (err) {
    hideLoading();
    showStatus("Cancel failed: " + err.message, "error");
    console.error(err);
  }
}

// ── Event listeners ─────────────────────────────────────────────────────────

elBtnLoad.addEventListener("click", loadOrders);
elBtnKeplr.addEventListener("click", connectKeplr);
elBtnCancel.addEventListener("click", cancelSelectedOrders);

elBtnSelectAll.addEventListener("click", () => {
  const checks = document.querySelectorAll(".order-check");
  const allChecked = Array.from(checks).every((cb) => cb.checked);
  checks.forEach((cb) => (cb.checked = !allChecked));
  elCheckAll.checked = !allChecked;
  updateCancelButton();
});

elCheckAll.addEventListener("change", () => {
  const checks = document.querySelectorAll(".order-check");
  checks.forEach((cb) => (cb.checked = elCheckAll.checked));
  updateCancelButton();
});

document.addEventListener("change", (e) => {
  if (e.target.classList.contains("order-check")) {
    updateCancelButton();
  }
});

elWalletInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") loadOrders();
});
