import express from "express";
import { find_root_sch_from_content, is_sch } from "./ecad-viewer";

const app = express();

app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb', extended: true}));

app.post(`/find_root_sch_from_file_map`, async (req, res) => {
    try {
        const { sch_map } = req.body;
        if(sch_map === undefined){
             res.status(400).json({ error: "sch_map is required" });
             return
        }
        const root_sch_file_name = find_root_sch_from_content(sch_map);
        if(!is_sch(root_sch_file_name)){
            res.status(400).json({ error: "root sch file not found" });
            return
        }

        res.json({ root_sch_file_name });
    } catch (e ) {
      console.log(e);
        res.json({ error: JSON.stringify(e) });
    }
});

app.get("/feed", async (req, res) => {
    res.json({ msg: "Hello World" });
});

app.listen(7123, () =>
    console.log(`
🚀 Server ready at: http://localhost:7123
⭐️ See sample requests: http://pris.ly/e/ts/rest-express#3-using-the-rest-api`),
);
