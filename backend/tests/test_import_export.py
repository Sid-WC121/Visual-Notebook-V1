import json
import zipfile
from io import BytesIO

import polars as pl
import pytest
from visual_notebook.controller import Controller

@pytest.fixture
def controller():
    c = Controller()
    df_bytes = b"x,y\n1,a\n2,b\n3,c\n4,d\n5,e"
    c.load_dataset("test.csv", df_bytes)
    return c

def test_export_import_cycle(controller):
    res1 = controller.execute("filter_range", {"column": "x", "min": 3, "max": 10})
    state1_id = res1["state_id"]

    res2 = controller.execute("sort_by", {"column": "y", "order": "desc"})
    state2_id = res2["state_id"]

    cells = [
        {
            "id": "c0",
            "type": "table",
            "stateId": controller.history.root.id,
            "opChain": [],
            "description": "Loaded: test.csv",
            "rowCount": 5,
            "lineage": ["Loaded: test.csv"]
        },
        {
            "id": "c1",
            "type": "table",
            "stateId": state1_id,
            "opChain": [{"op_id": "filter_range", "params": {"column": "x", "min": 3, "max": 10}}],
            "description": "x in [3, 10]",
            "rowCount": 3,
            "lineage": ["Loaded: test.csv", "x in [3, 10]"]
        },
        {
            "id": "c2",
            "type": "table",
            "stateId": state2_id,
            "opChain": [
                {"op_id": "filter_range", "params": {"column": "x", "min": 3, "max": 10}},
                {"op_id": "sort_by", "params": {"column": "y", "order": "desc"}}
            ],
            "description": "Sort y desc",
            "rowCount": 3,
            "lineage": ["Loaded: test.csv", "x in [3, 10]", "Sort y desc"]
        }
    ]

    zip_data = controller.export_notebook_zip(cells)

    new_controller = Controller()
    restored_cells = new_controller.import_notebook_zip(zip_data)

    assert len(restored_cells) == 3
    assert new_controller.has_data
    assert new_controller.dataset_name == "test.csv"

    assert len(new_controller.history.all_states()) == 3

    for i, cell in enumerate(restored_cells):
        new_state_id = cell["stateId"]
        assert new_state_id in new_controller.history._index
        state = new_controller.history.find(new_state_id)
        assert state.count == cells[i]["rowCount"]

    assert restored_cells[2]["opChain"] == [
        {"op_id": "sort_by", "params": {"column": "y", "order": "desc"}}
    ]

def test_export_import_with_branch(controller):
    res1 = controller.execute("filter_range", {"column": "x", "min": 3, "max": 10})
    state1_id = res1["state_id"]

    res2 = controller.branch_from(controller.history.root.id, "filter_range", {"column": "x", "min": 0, "max": 2})
    state2_id = res2["state_id"]

    cells = [
        {"type": "table", "stateId": controller.history.root.id, "opChain": []},
        {"type": "table", "stateId": state1_id, "opChain": [{"op_id": "filter_range", "params": {"column": "x", "min": 3, "max": 10}}]},
        {"type": "table", "stateId": state2_id, "opChain": [{"op_id": "filter_range", "params": {"column": "x", "min": 0, "max": 2}}]}
    ]

    zip_data = controller.export_notebook_zip(cells)
    new_controller = Controller()
    restored_cells = new_controller.import_notebook_zip(zip_data)

    assert len(new_controller.history.all_states()) == 3
    assert len(new_controller.history.root.children) == 2

    s1_id = restored_cells[1]["stateId"]
    s2_id = restored_cells[2]["stateId"]
    assert new_controller.history.find(s1_id).count == 3
    assert new_controller.history.find(s2_id).count == 2


def test_export_import_preserves_relative_frontend_cells(controller):
    res1 = controller.execute("filter_range", {"column": "x", "min": 3, "max": 10})
    state1_id = res1["state_id"]
    res2 = controller.execute("sort_by", {"column": "y", "order": "desc"})
    state2_id = res2["state_id"]
    chart = controller.execute("viz_histogram", {"column": "x", "bins": 5}, from_state_id=state1_id)

    cells = [
        {
            "id": "root",
            "type": "table",
            "stateId": controller.history.root.id,
            "opChain": [],
        },
        {
            "id": "filtered",
            "type": "table",
            "stateId": state1_id,
            "opChain": [{"op_id": "filter_range", "params": {"column": "x", "min": 3, "max": 10}}],
        },
        {
            "id": "hist",
            "type": "chart",
            "opId": "viz_histogram",
            "opParams": {"column": "x", "bins": 5},
            "spec": chart["spec"],
            "sourceStateId": state1_id,
        },
        {
            "id": "sorted",
            "type": "table",
            "stateId": state2_id,
            "opChain": [{"op_id": "sort_by", "params": {"column": "y", "order": "desc"}}],
        },
    ]

    zip_data = controller.export_notebook_zip(cells)
    with zipfile.ZipFile(BytesIO(zip_data), "r") as zf:
        recipe = json.loads(zf.read("notebook.json"))
    assert recipe["version"] == 3
    assert recipe["cells"][2]["sourceStateId"] == state1_id
    assert recipe["cells"][3]["parentSourceStateId"] == state1_id

    new_controller = Controller()
    restored_cells = new_controller.import_notebook_zip(zip_data)

    assert [cell["id"] for cell in restored_cells] == ["root", "filtered", "hist", "sorted"]
    assert restored_cells[2]["sourceStateId"] == restored_cells[1]["stateId"]
    assert new_controller.history.find(restored_cells[1]["stateId"]).count == 3
    assert new_controller.history.find(restored_cells[3]["stateId"]).count == 3
    values = new_controller.history.find(restored_cells[3]["stateId"]).lf.collect()["y"].to_list()
    assert values == ["e", "d", "c"]


def test_export_import_preserves_chart_timeline_range():
    controller = Controller()
    controller.load_dataset(
        "dates.csv",
        b"date,value\n2024-01-01,1\n2024-01-02,2\n2024-01-03,3\n2024-01-04,4",
    )
    chart = controller.execute(
        "viz_timeline",
        {"x": "date", "y": "value"},
        from_state_id=controller.history.root.id,
    )
    cells = [
        {
            "id": "root",
            "type": "table",
            "stateId": controller.history.root.id,
            "opChain": [],
        },
        {
            "id": "timeline",
            "type": "chart",
            "opId": "viz_timeline",
            "opParams": {"x": "date", "y": "value"},
            "spec": chart["spec"],
            "sourceStateId": controller.history.root.id,
            "timelineRange": {"xCol": "date", "min": "2024-01-02", "max": "2024-01-03"},
        },
    ]

    zip_data = controller.export_notebook_zip(cells)
    new_controller = Controller()
    restored_cells = new_controller.import_notebook_zip(zip_data)

    assert restored_cells[1]["timelineRange"] == {
        "xCol": "date",
        "min": "2024-01-02",
        "max": "2024-01-03",
    }
