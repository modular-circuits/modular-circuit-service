import express from "express";
import AdmZip from "adm-zip";
import multer from "multer";
import { get_kicad_project_bom_and_ports } from "./parser";

const app = express();
const upload = multer(); // 使用multer来处理上传的文件

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.post(`/get_kicad_project_bom_and_ports`, upload.single("file"), async (req, res) => {
    try {
        if (!req.file) {
             res.status(400).json({ error: "No file uploaded" });
             return
        }

        const zip = new AdmZip(req.file.buffer); // 使用上传的文件缓冲区
        const files: { filename: string; content: string }[] = [];

        // 解压文件，并存储其内容
        for (const entry of zip.getEntries()) {
            const filename = entry.entryName;
            if (!filename.endsWith(".kicad_sch")) continue;
            const content = zip.readAsText(entry);
            files.push({
                filename,
                content,
            });
        }
        
        // 使用自定义函数来处理提取的内容
        res.json(get_kicad_project_bom_and_ports(files));
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: JSON.stringify(e) });
    }
});

app.get("/feed", async (req, res) => {
    res.json({ msg: "Hello World" });
});

app.listen(7123, () =>
    console.log(`
🚀 Server ready at: http://localhost:7123
⭐️ See sample requests: http://pris.ly/e/ts/rest-express#3-using-the-rest-api`)
);
