import axios from "axios";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const ADDRESS_TO_MONITOR = "0x4e1b32cb147edfe07622c88b90f1ea0df00b6aed"; // İzlenecek cüzdan
const MAX_TRANSACTION_THRESHOLD = 100; // ETH cinsinden şüpheli işlem limiti

// 📌 Log & JSON dosyası ayarları
const LOG_DIR = path.join(__dirname, "..", "logs");
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
const DATE = new Date().toISOString().replace(/[:]/g, "-").replace("T", "_").split(".")[0];
const LOG_FILE_PATH = path.join(LOG_DIR, `${ADDRESS_TO_MONITOR}-dex-${DATE}.log`);

const JSON_DIR = path.join(__dirname, "..", "json");
if (!fs.existsSync(JSON_DIR)) fs.mkdirSync(JSON_DIR, { recursive: true });
const JSON_FILE_PATH = path.join(JSON_DIR, `${ADDRESS_TO_MONITOR}-dex-${DATE}.json`);

// 📌 Log fonksiyonları
function logToFile(message: string) {
    fs.appendFileSync(LOG_FILE_PATH, message + "\n");
}

function logToJson(data: any) {
    let existingData: any[] = [];
    if (fs.existsSync(JSON_FILE_PATH)) {
        const fileContent = fs.readFileSync(JSON_FILE_PATH, "utf8");
        existingData = JSON.parse(fileContent);
    }
    existingData.push(data);
    fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(existingData, null, 4));
}

// 📌 DEX İşlemlerini Takip Eden Fonksiyon
async function fetchDexTransactions() {
    const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${ADDRESS_TO_MONITOR}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;

    try {
        const response = await axios.get(url);
        if (response.data.status !== "1") return [];

        const transactions = response.data.result;

        for (const tx of transactions) {
            if (tx.to === null) continue; // Smart contract çağrısı olmayan işlemleri atla

            const valueETH = parseFloat(tx.value) / Math.pow(10, 18);
            const txHash = `https://etherscan.io/tx/${tx.hash}`;

            // Eğer işlem belirlenen büyük işlem eşiğini aşarsa
            if (valueETH >= MAX_TRANSACTION_THRESHOLD) {
                logToFile(`🚨 **DEX Üzerinde Büyük İşlem Tespit Edildi!**`);
                logToFile(`🔄 ${tx.from} → ${tx.to} | ${valueETH} ETH | Tx: ${txHash}`);

                logToJson({
                    type: "Suspicious DEX Transaction",
                    sender: tx.from,
                    receiver: tx.to,
                    amount: valueETH,
                    transactionHash: txHash,
                    suspicious: true
                });
            }
        }
    } catch (error) {
        logToFile("❌ DEX işlemleri alınırken hata oluştu: " + error);
    }
}

// 📌 Uniswap Üzerindeki İşlemleri Takip Et
async function fetchUniswapSwaps() {
    const url = `https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v3`;
    const query = `
    {
      swaps(where: { sender: "${ADDRESS_TO_MONITOR}" }) {
        transaction {
          id
        }
        amountUSD
        amount0
        amount1
      }
    }
    `;

    try {
        const response = await axios.post(url, { query });
        const swaps = response.data.data.swaps;

        for (const swap of swaps) {
            const txHash = `https://etherscan.io/tx/${swap.transaction.id}`;
            const amountUSD = parseFloat(swap.amountUSD);

            // Eğer swap işlemi büyük bir miktar içeriyorsa
            if (amountUSD >= 50000) {
                logToFile(`🚨 **Uniswap Üzerinde Büyük Swap Tespit Edildi!**`);
                logToFile(`🔄 Swap: ${swap.amount0} / ${swap.amount1} | ${amountUSD} USD | Tx: ${txHash}`);

                logToJson({
                    type: "Large Uniswap Swap",
                    amount0: swap.amount0,
                    amount1: swap.amount1,
                    amountUSD,
                    transactionHash: txHash,
                    suspicious: true
                });
            }
        }
    } catch (error) {
        logToFile("❌ Uniswap işlemleri alınırken hata oluştu: " + error);
    }
}

// 📌 Flash Loan & Tornado Cash Analizi
async function checkFlashLoanUsage() {
    const mixerContracts = new Set([
        "0x1111111111111111111111111111111111111111", // Tornado Cash 0.1 ETH Pool
        "0x2222222222222222222222222222222222222222", // Tornado Cash 1 ETH Pool
    ]);

    const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${ADDRESS_TO_MONITOR}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;

    try {
        const response = await axios.get(url);
        const transactions = response.data.result;

        for (const tx of transactions) {
            if (mixerContracts.has(tx.to)) {
                logToFile(`🚨 **Tornado Cash Kullanımı Tespit Edildi!**`);
                logToFile(`🔄 ${tx.from} → ${tx.to} | Tx: https://etherscan.io/tx/${tx.hash}`);

                logToJson({
                    type: "Tornado Cash Usage",
                    sender: tx.from,
                    receiver: tx.to,
                    transactionHash: `https://etherscan.io/tx/${tx.hash}`,
                    suspicious: true
                });
            }
        }
    } catch (error) {
        logToFile("❌ Tornado Cash analizi sırasında hata oluştu: " + error);
    }
}

// 📌 Tüm Fonksiyonları Çağır
(async function () {
    logToFile("🚀 DEX İzleme Başlatıldı...");
    await fetchDexTransactions();
    await fetchUniswapSwaps();
    await checkFlashLoanUsage();
    logToFile("✅ DEX İzleme Tamamlandı.");
})();
