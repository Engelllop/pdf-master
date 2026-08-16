"""Las marcas viajan en el PDF: al reabrir sin sidecar se recuperan id, autor y hilo."""
import os


def _ann(id_, type_, **extra):
    base = {"id": id_, "type": type_, "page": 0, "x": 40, "y": 40,
            "color": "#ef4444", "author": "Engell", "status": "open", "layer": "Revisión"}
    base.update(extra)
    return base


class TestMarkupNativo:
    def test_reabrir_sin_sidecar_recupera_revision(self, client, open_doc, tmp_path):
        info = open_doc(pages=1)
        doc_id = info["doc_id"]
        out = str(tmp_path / "con-marcas.pdf")
        anns = {"annotations": [
            _ann("h1", "highlight", x=50, y=50, width=120, height=14,
                 replies=[{"id": "r1", "author": "Otro", "text": "Revisar cota", "at": 1785000100000}]),
            _ann("rc1", "rect", x=80, y=80, width=60, height=40),
            _ann("ln1", "line", x=20, y=200, width=100, height=30, lineWidth=2),
            _ann("ar1", "arrow", x=20, y=250, width=80, height=-20),
            _ann("tx1", "text", x=200, y=60, width=140, height=28, text="nota embebida", fontSize=12),
            _ann("nt1", "note", x=300, y=80, text="comentario"),
            _ann("dr1", "draw", points=[{"x": 30, "y": 300}, {"x": 50, "y": 320}, {"x": 70, "y": 310}]),
            _ann("pg1", "polygon", points=[{"x": 200, "y": 200}, {"x": 260, "y": 200}, {"x": 230, "y": 250}]),
            _ann("ct1", "count", x=400, y=120, text="Tomas", symbol="circle"),
            _ann("md1", "measure_distance", x=40, y=400, width=80, height=0,
                 measurement={"value": 2.5, "unit": "m", "label": "2.50 m"}),
        ]}
        assert client.post(f"/pdf/embed/{doc_id}", json=anns).status_code == 200
        assert client.post(f"/pdf/save/{doc_id}?output_path={out}").status_code == 200
        assert not os.path.exists(out + ".pdfmaster.json")

        client.post(f"/pdf/close/{doc_id}")
        reopened = client.post("/pdf/open", json={"file_path": out})
        assert reopened.status_code == 200
        new_id = reopened.json()["doc_id"]
        loaded = client.get(f"/pdf/annotations/{new_id}").json()["annotations"]
        client.post(f"/pdf/close/{new_id}")

        by_id = {a["id"]: a for a in loaded}
        assert set(by_id) >= {"h1", "rc1", "ln1", "ar1", "tx1", "nt1", "dr1", "pg1", "ct1", "md1"}
        assert by_id["h1"]["author"] == "Engell"
        assert by_id["h1"]["status"] == "open"
        assert by_id["h1"]["replies"][0]["text"] == "Revisar cota"
        assert by_id["h1"]["replies"][0]["author"] == "Otro"
        assert by_id["rc1"]["type"] == "rect"
        assert by_id["ar1"]["type"] == "arrow"
        assert by_id["tx1"]["text"] == "nota embebida"
        assert by_id["ct1"]["type"] == "count"
        assert by_id["ct1"]["text"] == "Tomas"
        assert by_id["md1"]["measurement"]["label"] == "2.50 m"
        assert by_id["ln1"]["width"] == 100
        assert by_id["dr1"]["type"] == "draw"
        assert len(by_id["dr1"]["points"] or []) >= 2
