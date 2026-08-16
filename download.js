const fs = require('fs-extra');
const axios = require('axios');
const path = require('path');

const DATA_DIR = './data';
const SAVE_DIR = './images';

// 目标年份
const TARGET_YEARS = ["2010","2011","2012","2013"];

async function downloadImage(url, savePath) {
    if (fs.existsSync(savePath)) {
        console.log(`✅已存在跳过: ${path.basename(savePath)}`);
        return true;
    }
    console.log(`⬇️下载: ${url}`);
    try {
        const res = await axios.get(url, {
            responseType: 'stream',
            timeout: 45000,
            headers: {
                "User‑Agent":"Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36"
            }
        });
        const writer = fs.createWriteStream(savePath);
        res.data.pipe(writer);
        await new Promise((resolve, reject)=>{
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
        return true;
    } catch(err){
        console.error(`❌下载失败 ${url} : ${err.message}`);
        return false;
    }
}

async function main(){
    for(const year of TARGET_YEARS){
        const fname = `zh.${year}.json`;
        const fullPath = path.join(DATA_DIR, fname);
        if(!fs.existsSync(fullPath)){
            console.log(`\n⚠️ 文件不存在跳过：${fname}`);
            continue;
        }
        // 按年份建立子目录 images/2010 ...
        const yearDir = path.join(SAVE_DIR, year);
        fs.ensureDirSync(yearDir);

        const raw = fs.readFileSync(fullPath, 'utf-8');
        const list = JSON.parse(raw);
        console.log(`\n📄处理文件: ${fname} 共${list.length}条记录 → 输出到 ${yearDir}`);

        for(const item of list){
            if(!item.bing_url) continue;
            const fn = path.basename(new URL(item.bing_url).pathname);
            const save = path.join(yearDir, fn);
            await downloadImage(item.bing_url, save);
        }
    }
}

main().then(()=>{
    console.log("\n🎉指定年份任务执行完毕，图片已按年份分文件夹");
    process.exit(0);
}).catch(e=>{
    console.error("脚本异常",e);
    process.exit(1);
})
