import os

from flask import Flask, render_template, jsonify, request
from models.student_store import StudentStore

app = Flask(__name__)

store = StudentStore()

sample_students = [
    {"student_id": 24520001, "full_name": "Nguyen Van A", "gender": "Nam", "class_name": "CNTT01"},
    {"student_id": 24520002, "full_name": "Tran Thi B", "gender": "Nữ", "class_name": "CNTT01"},
    {"student_id": 24520003, "full_name": "Le Van C", "gender": "Nam", "class_name": "CNTT02"},
    {"student_id": 24520004, "full_name": "Pham Thi D", "gender": "Nữ", "class_name": "CNTT02"},
    {"student_id": 24520005, "full_name": "Hoang Van E", "gender": "Nam", "class_name": "CNTT03"},
    {"student_id": 24520006, "full_name": "Dang Thi F", "gender": "Nữ", "class_name": "CNTT03"},
    {"student_id": 24520007, "full_name": "Do Van G", "gender": "Nam", "class_name": "CNTT04"},
    {"student_id": 24520008, "full_name": "Bui Thi H", "gender": "Nữ", "class_name": "CNTT04"},
    {"student_id": 24520009, "full_name": "Nguyen Van I", "gender": "Nam", "class_name": "CNTT05"},
    {"student_id": 24520010, "full_name": "Tran Thi K", "gender": "Nữ", "class_name": "CNTT05"},
]

for student in sample_students:
    if student["gender"] != "Nam":
        student["gender"] = "Nu"
    store.add_student(student)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/students", methods=["GET"])
def get_students():
    return jsonify(store.get_all_students())


@app.route("/api/students", methods=["POST"])
def add_student():
    data = request.get_json() or {}

    result = store.add_student({
        "student_id": data.get("student_id", ""),
        "full_name": data.get("full_name", ""),
        "gender": data.get("gender", "Nam"),
        "class_name": data.get("class_name", "")
    })

    if result["success"]:
        return jsonify(result), 201
    return jsonify(result), 400


@app.route("/api/students/<student_id>", methods=["DELETE"])
def delete_student(student_id):
    result = store.delete_student(student_id)

    if result["success"]:
        return jsonify(result), 200
    return jsonify(result), 404


@app.route("/api/students/search/id/<student_id>", methods=["GET"])
def search_student_by_id(student_id):
    result = store.find_student_by_id(student_id)

    if result["success"]:
        return jsonify(result), 200
    return jsonify(result), 404


@app.route("/api/students/search/name/<path:full_name>", methods=["GET"])
def search_students_by_name(full_name):
    result = store.find_students_by_name(full_name)

    if result["success"]:
        return jsonify(result), 200
    return jsonify(result), 404


@app.route("/api/index/id-btree", methods=["GET"])
def get_id_btree():
    return jsonify(store.get_id_btree_visual_dict())


@app.route("/api/index/name-btree", methods=["GET"])
def get_name_btree():
    return jsonify(store.get_name_btree_visual_dict())


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
