import axios from "axios";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Çevresel değişkenleri yükle
dotenv.config();

const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const WALLET_ADDRESS = "0x4e1b32cb147edfe07622c88b90f1ea0df00b6aed";
const MAX_DEPTH = 2; // Kaç "hop" derinliğe kadar takip edilecek
const MIN_PERCENTAGE_THRESHOLD = 0.3; // %30 eşik değeri
const LABEL = "scam";

// 📌 Log dizini (Bir üst klasörde `logs/`)
const LOG_DIR = path.join(__dirname, "..", "logs");

// 📌 Log dizini yoksa oluştur
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// 📌 JSON dizini (Bir üst klasörde `json/`)
const JSON_DIR = path.join(__dirname, "..", "json");

// 📌 JSON dizini yoksa oluştur
if (!fs.existsSync(JSON_DIR)) {
    fs.mkdirSync(JSON_DIR, { recursive: true });
}

// 📌 Tarih formatını oluştur (YYYY-MM-DD_HH-MM-SS)
const DATE = new Date().toISOString().replace(/[:]/g, "-").replace("T", "_").split(".")[0];
const LOG_FILE_PATH = path.join(LOG_DIR, `${WALLET_ADDRESS}-${DATE}.log`);
const JSON_FILE_PATH = path.join(JSON_DIR, `${WALLET_ADDRESS}-${DATE}.json`);

// 📌 Log dosyasını temizle ve başlık ekle
fs.writeFileSync(LOG_FILE_PATH, `Ethereum Adresi: ${WALLET_ADDRESS}\nTarih: ${DATE.replace("_", " ")}\n\n`);

// 📌 Log fonksiyonu (Sadece `../logs/` dizinine yazacak)
function logToFile(message: string) {
    fs.appendFileSync(LOG_FILE_PATH, message + "\n");
}

// 📌 Basit Metin Tablo Formatında Log Yazma
function logTableToFileSimple(headers: string[], rows: any[][]) {
    let tableString = "";

    // Başlıkları ekleyelim
    tableString += headers.join(" | ") + "\n";
    tableString += "-".repeat(headers.join(" | ").length) + "\n";

    // Satırları ekleyelim
    for (const row of rows) {
        tableString += row.join(" | ") + "\n";
    }

    // Log dosyasına ekle
    logToFile(tableString);
}

// 📌 JSON formatında veriyi kaydetme fonksiyonu
function logToJson(data: any) {
    let existingData: any[] = [];

    // Eğer dosya varsa, mevcut veriyi oku ve içine ekle
    if (fs.existsSync(JSON_FILE_PATH)) {
        const fileContent = fs.readFileSync(JSON_FILE_PATH, "utf8");
        existingData = JSON.parse(fileContent);
    }

    // Yeni veriyi mevcut listeye ekleyerek güncelle
    existingData.push(data);

    // JSON dosyasına yaz
    fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(existingData, null, 4));
}

// 📌 JSON formatında tablo yazdıran fonksiyon
function logTableToJson(headers: string[], rows: any[][], sectionName: string) {
    const tableData = rows.map(row => {
        let obj: { [key: string]: any } = {};
        headers.forEach((header, index) => {
            obj[header] = row[index];
        });
        return obj;
    });

    logToJson({ [sectionName]: tableData });
}

// 📌 1. ERC-20 Token Transferlerini Getir ve Dosyaya Yaz
async function fetchERC20Transfers() {
    try {
        const url = `https://api.etherscan.io/api?module=account&action=tokentx&address=${WALLET_ADDRESS}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
        const response = await axios.get(url);
        const transactions = response.data.result;

        if (transactions.length === 0) {
            logToFile("Bu adrese ait hiçbir ERC-20 token transferi bulunamadı.");
            logToJson({ message: "Bu adrese ait hiçbir ERC-20 token transferi bulunamadı." });
            return;
        }

        const rows = [];
        for (const tx of transactions) {
            rows.push([
                tx.blockNumber,
                new Date(parseInt(tx.timeStamp) * 1000).toLocaleString(),
                tx.from,
                tx.to,
                `${tx.tokenName} (${tx.tokenSymbol})`,
                (parseFloat(tx.value) / Math.pow(10, tx.tokenDecimal)).toFixed(4),
                `https://etherscan.io/tx/${tx.hash}`
            ]);
        }

        logTableToFileSimple(["Blok", "Zaman", "Kimden", "Kime", "Token", "Miktar", "Tx Hash"], rows);
        logTableToJson(["Blok", "Zaman", "Kimden", "Kime", "Token", "Miktar", "Tx Hash"], rows, "ERC20_Transactions");
    } catch (error) {
        logToFile("ERC-20 işlemleri alınırken hata oluştu: " + error);
        logToJson({ error: "ERC-20 işlemleri alınırken hata oluştu: " + error });
    }
}

// 📌 2. ERC-20 Token Bakiyelerini Getir ve Dosyaya Yaz
async function getAllERC20Tokens() {
    try {
        const response = await axios.get(
            `https://api.etherscan.io/api?module=account&action=tokentx&address=${WALLET_ADDRESS}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`
        );
        const transactions = response.data.result;

        if (transactions.length === 0) {
            logToFile("Bu adrese ait hiçbir ERC-20 işlemi bulunamadı.");            
            logToJson({ message: "Bu adrese ait hiçbir ERC-20 işlemi bulunamadı." });
            return;
        }

        const uniqueTokens = new Set(transactions.map((tx: any) => tx.contractAddress));
        logToFile(`Cüzdandaki ERC-20 Tokenler:\n`);        
        logToJson({ message: "Cüzdandaki ERC-20 Tokenler:" });

        const rows = [];
        for (let tokenAddress of uniqueTokens) {
            const balance = await getTokenBalance(tokenAddress as string);
            const tokenInfo = transactions.find((tx: any) => tx.contractAddress === tokenAddress);
            if (tokenInfo) {
                rows.push([
                    tokenInfo.tokenName,
                    tokenInfo.tokenSymbol,
                    tokenAddress,
                    balance.toFixed(4)
                ]);
            }
        }

        logTableToFileSimple(["Token Adı", "Sembol", "Token Adresi", "Bakiye"], rows);
        logTableToJson(["Token Adı", "Sembol", "Token Adresi", "Bakiye"], rows, "ERC20_Transactions");
    } catch (error) {
        logToFile("ERC-20 tokenler alınırken hata oluştu: " + error);
        logToJson({ error: "ERC-20 tokenler alınırken hata oluştu: " + error });
    }
}

// 📌 2. Token Bakiye Kontrolü
async function getTokenBalance(tokenContractAddress: string) {
    const url = `https://api.etherscan.io/api?module=account&action=tokenbalance&contractaddress=${tokenContractAddress}&address=${WALLET_ADDRESS}&tag=latest&apikey=${ETHERSCAN_API_KEY}`;

    try {
        const response = await axios.get(url);
        const balance = parseFloat(response.data.result) / Math.pow(10, 18);
        return balance;
    } catch (error) {
        const errorMessage = `${tokenContractAddress} adresi için hata oluştu: ${error}`;
        logToFile(errorMessage);
        logToJson({ error: errorMessage });
        
        return 0;
    }
}

// 📌 3. NFT Transferlerini Getir ve Dosyaya Yaz
async function getNFTTransactions() {
    try {
        const url = `https://api.etherscan.io/api?module=account&action=tokennfttx&address=${WALLET_ADDRESS}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
        const response = await axios.get(url);
        const transactions = response.data.result;

        if (transactions.length === 0) {
            logToFile("Bu adrese ait hiçbir NFT transferi bulunamadı.");
            logToJson({ message: "Bu adrese ait hiçbir NFT transferi bulunamadı." });
            return;
        }

        const rows = [];
        for (const tx of transactions) {
            rows.push([
                tx.blockNumber,
                new Date(parseInt(tx.timeStamp) * 1000).toLocaleString(),
                tx.from,
                tx.to,
                tx.tokenName,
                tx.tokenID,
                `https://etherscan.io/tx/${tx.hash}`
            ]);
        }

        logTableToFileSimple(["Blok", "Zaman", "Kimden", "Kime", "NFT Adı", "NFT ID", "Tx Hash"], rows);
        logTableToJson(["Blok", "Zaman", "Kimden", "Kime", "NFT Adı", "NFT ID", "Tx Hash"], rows, "NFT_Transactions");
    } catch (error) {
        logToFile("NFT transferleri alınırken hata oluştu: " + error);
        logToJson({ error: "NFT transferleri alınırken hata oluştu: " + error });
    
    }
}

// 📌 4. ETH Bakiyesini Getir ve Dosyaya Yaz
async function getETHBalance() {
    const url = `https://api.etherscan.io/api?module=account&action=balance&address=${WALLET_ADDRESS}&tag=latest&apikey=${ETHERSCAN_API_KEY}`;

    try {
        const response = await axios.get(url);
        const balanceInWei = response.data.result;
        const balanceInETH = parseFloat(balanceInWei) / Math.pow(10, 18);
        logToFile(`Cüzdan Bakiyesi: ${balanceInETH} ETH\n`);
        logToJson({ ETH_Balance: `${balanceInETH} ETH` });
    } catch (error) {
        logToFile("Bakiye alınırken hata oluştu: " + error);        
        logToJson({ error: "Bakiye alınırken hata oluştu: " + error });
    }
}

// 📌 5. ETH Transferlerini Getir ve Dosyaya Yaz
async function getETHTransactions() {
    const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${WALLET_ADDRESS}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;

    try {
        const response = await axios.get(url);
        const transactions = response.data.result;

        if (transactions.length === 0) {
            logToFile("Bu adrese ait hiçbir ETH transferi bulunamadı.");
            logToJson({ message: "Bu adrese ait hiçbir ETH transferi bulunamadı." });
            return;
        }

        const rows = [];
        for (const tx of transactions) {
            rows.push([
                tx.blockNumber,
                new Date(parseInt(tx.timeStamp) * 1000).toLocaleString(),
                tx.from,
                tx.to,
                (parseFloat(tx.value) / Math.pow(10, 18)).toFixed(4),
                `https://etherscan.io/tx/${tx.hash}`
            ]);
        }

        logTableToFileSimple(["Blok", "Zaman", "Kimden", "Kime", "Miktar (ETH)", "Tx Hash"], rows);
        logTableToJson(["Blok", "Zaman", "Kimden", "Kime", "Miktar", "Tx Hash"], rows, "ETH_Transactions");

    } catch (error) {
        logToFile("ETH transferleri alınırken hata oluştu: " + error);
        logToJson({ error: "ETH transferleri alınırken hata oluştu: " + error });
    }
}

// İşlem türünü tanımlıyoruz
interface EtherscanTransaction {
    blockNumber: string;
    timeStamp: string;
    hash: string;
    from: string;
    to: string;
    value: string;
    tokenName?: string;
    tokenSymbol?: string;
    tokenDecimal?: string;
    contractAddress?: string;
}

// Bilinen hacker adresleriyle işlem yapıp yapmadığını kontrol eden fonksiyon
async function checkHackerInteractions() {
    const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${WALLET_ADDRESS}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;

    const hackerAddresses = new Set([
        "0x1234567890abcdef1234567890abcdef12345678",
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd"
    ]);

    try {
        const response = await axios.get(url);
        const transactions: EtherscanTransaction[] = response.data.result; // ✅ API'den dönen veriyi tipliyoruz

        if (transactions.length === 0) {
            logToFile("Bu cüzdanın işlem geçmişi bulunamadı.");            
            logToJson({ message: "Bu cüzdanın işlem geçmişi bulunamadı." });
            return;
        }

        // ✅ Hacker adresleriyle eşleşen işlemleri filtrele
        const riskyTransactions = transactions.filter((tx: EtherscanTransaction) =>
            hackerAddresses.has(tx.from) || hackerAddresses.has(tx.to)
        );

        if (riskyTransactions.length > 0) {
            logToFile("Bu cüzdan hacker adresleriyle etkileşimde bulunmuş!");            
            logToJson({ message: "Bu cüzdan hacker adresleriyle etkileşimde bulunmuş!." });
            const rows = riskyTransactions.map((tx: EtherscanTransaction) => [
                tx.blockNumber,
                new Date(parseInt(tx.timeStamp) * 1000).toLocaleString(),
                tx.from,
                tx.to,
                `https://etherscan.io/tx/${tx.hash}`
            ]);
            logTableToFileSimple(["Blok", "Zaman", "Kimden", "Kime", "İşlem Linki"], rows);            
            logTableToJson(["Blok", "Zaman", "Kimden", "Kime", "İşlem Linki"], rows, "ERC20_Transactions");
        } else {
            logToFile("Bu cüzdan bilinen hacker adresleriyle etkileşime girmemiş.");
            logToJson({ message: "Bu cüzdan bilinen hacker adresleriyle etkileşime girmemiş." });
        }
    } catch (error) {
        logToFile("Hacker adres analizi sırasında hata oluştu: " + error);
        logToJson({ error: "Hacker adres analizi sırasında hata oluştu: " + error });
    }
}

async function checkTornadoCashUsage() {
    const tornadoCashContracts = new Set([
        "0x1111111254EEB25477B68fb85Ed929f73A960582", // Tornado Cash 0.1 ETH Pool
        "0x2222221254EEB25477B68fb85Ed929f73A960582"  // Tornado Cash 1 ETH Pool
    ]);

    const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${WALLET_ADDRESS}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;

    try {
        const response = await axios.get(url);
        const transactions = response.data.result;

        const mixerTransactions = transactions.filter((tx: EtherscanTransaction) =>
            tornadoCashContracts.has(tx.from) || tornadoCashContracts.has(tx.to)
        );

        if (mixerTransactions.length > 0) {
            logToFile("Bu cüzdan Tornado Cash ile etkileşimde bulunmuş!");            
            logToJson({ message: "Bu cüzdan Tornado Cash ile etkileşimde bulunmuş!" });
            const rows = mixerTransactions.map((tx: EtherscanTransaction) => [
                tx.blockNumber,
                new Date(parseInt(tx.timeStamp) * 1000).toLocaleString(),
                tx.from,
                tx.to,
                `https://etherscan.io/tx/${tx.hash}`
            ]);
            logTableToFileSimple(["Blok", "Zaman", "Kimden", "Kime", "İşlem Linki"], rows);
            logTableToJson(["Blok", "Zaman", "Kimden", "Kime", "İşlem Linki"], rows, "ERC20_Transactions");
        } else {
            logToFile("Bu cüzdan Tornado Cash kullanmamış.");
            logToJson({ message: "Bu cüzdan Tornado Cash kullanmamış." });
        }
    } catch (error) {
        logToFile("Tornado Cash analizi sırasında hata oluştu: " + error);
        logToJson({ error: "Tornado Cash analizi sırasında hata oluştu: " + error });
    }
}

async function checkDarknetAndScamTransactions() {

    const knownScamAddresses = new Set([
        "0x1234567890abcdef1234567890abcdef12345678", // Örnek darknet adresi
        "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd", // Örnek scam adresi
        "0x1111111254EEB25477B68fb85Ed929f73A960582", // Tornado Cash adresi (Mixer)
        "0x3333333333d37ECbc15C9353D55f4D9AB5e90c70", // Örnek rug-pull projesi
        "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"  // Bilinen hacker cüzdanı
    ]);
    const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${WALLET_ADDRESS}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;

    try {
        const response = await axios.get(url);
        const transactions = response.data.result;

        if (transactions.length === 0) {
            logToFile("Bu cüzdanın işlem geçmişi bulunamadı.");            
            logToJson({ message: "Bu cüzdanın işlem geçmişi bulunamadı" });
            return;
        }

        // Bilinen scam & darknet adresleriyle eşleşen işlemleri filtrele
        const riskyTransactions = transactions.filter((tx: EtherscanTransaction) =>
            knownScamAddresses.has(tx.from) || knownScamAddresses.has(tx.to)
        );

        if (riskyTransactions.length > 0) {
            logToFile("Bu cüzdan scam & darknet adresleriyle etkileşimde bulunmuş!");            
            logToJson({ message: "Bu cüzdan scam & darknet adresleriyle etkileşimde bulunmuş!" });
            const rows = riskyTransactions.map((tx: EtherscanTransaction) => [
                tx.blockNumber,
                new Date(parseInt(tx.timeStamp) * 1000).toLocaleString(),
                tx.from,
                tx.to,
                (parseFloat(tx.value) / Math.pow(10, 18)).toFixed(4) + " ETH",
                `https://etherscan.io/tx/${tx.hash}`
            ]);
            logTableToFileSimple(["Blok", "Zaman", "Kimden", "Kime", "Miktar", "Tx Hash"], rows);
            logTableToJson(["Blok", "Zaman", "Kimden", "Kime", "Miktar", "Tx Hash"], rows, "ERC20_Transactions");
        } else {
            logToFile("Bu cüzdan scam & darknet adresleriyle etkileşime girmemiş.");
            logToJson({ message: "Bu cüzdan scam & darknet adresleriyle etkileşime girmemiş." });
        }
    } catch (error) {
        logToFile("Darknet & scam adres analizi sırasında hata oluştu: " + error);
        logToJson({ error: "Darknet & scam adres analizi sırasında hata oluştu: " + error });

    }
}

// 📌 API’den işlem geçmişini al
async function fetchTransactions(wallet: string) {
    const url = `https://api.etherscan.io/api?module=account&action=txlist&address=${wallet}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;

    try {
        const response = await axios.get(url);
        if (response.data.status !== "1") return [];
        return response.data.result;
    } catch (error) {
        logToFile(`❌ ${wallet} adresinin işlemleri alınamadı: ${error}`);
        return [];
    }
}

// 📌 Multi-Hop Transferleri İzleyen Fonksiyon
async function trackMultiHop(wallet: string, depth: number, visited: Set<string>, prevAmount: number) {
    if (depth > MAX_DEPTH || visited.has(wallet)) return;
    visited.add(wallet);

    logToFile(`🔎 ${depth}. Hop: ${wallet} adresi takip ediliyor...`);

    const transactions = await fetchTransactions(wallet);

    for (const tx of transactions) {
        const sender = tx.from;
        const receiver = tx.to;
        const amount = parseFloat(tx.value) / Math.pow(10, 18);
        const txHash = `https://etherscan.io/tx/${tx.hash}`;
        
        // Eğer transfer edilen miktar önceki hop'un %30'undan fazla ise loga yaz
        if (amount >= prevAmount * MIN_PERCENTAGE_THRESHOLD) {
            logToFile(`🚨 **Şüpheli İşlem Tespit Edildi!**`);
            logToFile(`🔄 ${sender} → ${receiver} | ${amount} ETH | Tx: ${txHash}`);

            // JSON'a yazdır
            logToJson({
                depth,
                sender,
                receiver,
                amount,
                transactionHash: txHash,
                suspicious: true
            });

            // Eğer bu transfer yeni bir cüzdana gidiyorsa, zinciri takip et
            if (!visited.has(receiver)) {
                await trackMultiHop(receiver, depth + 1, visited, amount);
            }
        }
    }
}

async function fetchBlacklistedAddresses() {
    const url = `https://api.etherscan.io/api?module=account&action=tokenblacklist&tag=${LABEL}&apikey=${ETHERSCAN_API_KEY}`;

    try {
        const response = await axios.get(url);
        if (response.data.status !== "1") {
            console.error("API'den geçerli veri alınamadı.");
            return;
        }

        const suspiciousAddresses = response.data.result;
        logToFile(`Şüpheli Adresler:, ${suspiciousAddresses}`);

        // 📌 JSON dosyasına kaydet
        logToJson({ date: DATE, label: LABEL, addresses: suspiciousAddresses });

        
    } catch (error) {
        logToFile("Adresler alınırken hata oluştu: " + error);
        logToJson({ error: "Adresler alınırken hata oluştu:" + error });
    }
}


// 📌 Tüm Fonksiyonları Çağır
(async function () {
    await getETHBalance();
    await getAllERC20Tokens();
    await fetchERC20Transfers();
    await getNFTTransactions();
    await getETHTransactions();
    await checkHackerInteractions();
    await checkTornadoCashUsage();
    await checkDarknetAndScamTransactions();
    await trackMultiHop(WALLET_ADDRESS, 1, new Set(),100);
    await fetchBlacklistedAddresses();;
})();
