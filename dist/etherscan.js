"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const dotenv = __importStar(require("dotenv"));
// Çevresel değişkenleri yükle
dotenv.config();
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const WALLET_ADDRESS = "0xYourWalletAddressHere"; // Buraya Ethereum adresinizi yazın
// API URL'sini oluştur
const ETHERSCAN_API_URL = `https://api.etherscan.io/api?module=account&action=tokentx&address=${WALLET_ADDRESS}&startblock=0&endblock=99999999&sort=asc&apikey=${ETHERSCAN_API_KEY}`;
// API'den veri çekme fonksiyonu
function fetchERC20Transfers() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const response = yield axios_1.default.get(ETHERSCAN_API_URL);
            if (response.data.status !== "1") {
                console.error("API Hatası:", response.data.message);
                return;
            }
            const transactions = response.data.result;
            if (transactions.length === 0) {
                console.log("Bu adrese ait hiçbir ERC-20 token transferi bulunamadı.");
                return;
            }
            // Transferleri uygun formatta yazdır
            transactions.forEach((tx) => {
                console.log(`
            📌 **Blok Numarası:** ${tx.blockNumber}
            ⏳ **Zaman:** ${new Date(parseInt(tx.timeStamp) * 1000).toLocaleString()}
            🏦 **Kimden:** ${tx.from}
            🎯 **Kime:** ${tx.to}
            🔗 **Token Adı:** ${tx.tokenName} (${tx.tokenSymbol})
            💰 **Miktar:** ${parseFloat(tx.value) / Math.pow(10, tx.tokenDecimal)}
            🌐 **İşlem Linki:** https://etherscan.io/tx/${tx.hash}
            `);
            });
        }
        catch (error) {
            console.error("Veri çekerken hata oluştu:", error);
        }
    });
}
// Fonksiyonu çağır
fetchERC20Transfers();
