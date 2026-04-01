from models.btree import BTree


class StudentStore:
    def __init__(self):
        self.students = []
        self.id_btree = BTree(order=3, key_func=int)
        self.name_btree = BTree(order=3, key_func=lambda s: str(s).strip().lower())

    def get_all_students(self):
        return list(self.students)

    def _parse_student_id(self, student_id):
        if isinstance(student_id, int):
            return student_id

        raw_value = str(student_id).strip()
        if not raw_value:
            raise ValueError("Student ID cannot be empty.")
        if not raw_value.isdigit():
            raise ValueError("Student ID must be an integer.")
        return int(raw_value)

    def _normalize_gender(self, gender):
        normalized = str(gender).strip().lower()
        if normalized in {"nu", "female", "f"}:
            return "Female"
        return "Male"

    def _normalize_student_input(self, student):
        student_id = self._parse_student_id(student.get("student_id", ""))
        full_name = str(student.get("full_name", "")).strip()
        gender = self._normalize_gender(student.get("gender", "Nam"))
        class_name = str(student.get("class_name", "")).strip()

        if not full_name:
            raise ValueError("Full name cannot be empty.")
        if not class_name:
            raise ValueError("Class name cannot be empty.")

        return {
            "student_id": student_id,
            "full_name": full_name,
            "gender": gender,
            "class_name": class_name,
        }

    def _serialize_btree_node(self, node):
        if node is None:
            return {"leaf": True, "keys": [], "raw_keys": [], "children": []}

        return {
            "leaf": node.leaf,
            "keys": [entry["key"] for entry in node.keys],
            "raw_keys": [entry["key"] for entry in node.keys],
            "children": [self._serialize_btree_node(child) for child in node.children],
        }

    def _serialize_name_btree_node(self, node):
        if node is None:
            return {"leaf": True, "keys": [], "raw_keys": [], "children": []}

        keys = []
        raw_keys = []
        for entry in node.keys:
            raw_key = entry["key"]
            keys.append(f"{raw_key} ({len(entry['value'])})")
            raw_keys.append(raw_key)

        return {
            "leaf": node.leaf,
            "keys": keys,
            "raw_keys": raw_keys,
            "children": [self._serialize_name_btree_node(child) for child in node.children],
        }

    def get_id_btree_visual_dict(self):
        return self._serialize_btree_node(self.id_btree.root)

    def get_name_btree_visual_dict(self):
        return self._serialize_name_btree_node(self.name_btree.root)

    def _insert_name_index(self, student):
        search_result = self.name_btree.search(student["full_name"])
        if search_result["found"]:
            search_result["entry"]["value"].append(student)
        else:
            self.name_btree.insert(student["full_name"], [student])

    def rebuild_indexes(self):
        self.id_btree = BTree(order=3, key_func=int)
        self.name_btree = BTree(order=3, key_func=lambda s: str(s).strip().lower())

        for student in self.students:
            self.id_btree.insert(student["student_id"], student)
            self._insert_name_index(student)

    def add_student(self, student):
        try:
            normalized_student = self._normalize_student_input(student)
        except ValueError as exc:
            return {"success": False, "message": str(exc)}

        if self.id_btree.search(normalized_student["student_id"])["found"]:
            return {"success": False, "message": "Student ID already exists."}

        self.students.append(normalized_student)
        self.id_btree.insert(normalized_student["student_id"], normalized_student)
        self._insert_name_index(normalized_student)

        return {
            "success": True,
            "message": "Student added successfully.",
            "student": normalized_student,
            "highlight": {
                "table_student_id": normalized_student["student_id"],
                "table_student_ids": [normalized_student["student_id"]],
                "id_key": normalized_student["student_id"],
                "name_key": normalized_student["full_name"],
            },
        }

    def delete_student(self, student_id):
        try:
            target_id = self._parse_student_id(student_id)
        except ValueError as exc:
            return {"success": False, "message": str(exc)}

        for index, student in enumerate(self.students):
            if student["student_id"] != target_id:
                continue

            deleted_student = self.students.pop(index)
            self.rebuild_indexes()
            return {
                "success": True,
                "message": "Student deleted successfully.",
                "deleted_student": deleted_student,
                "highlight": {
                    "table_student_id": deleted_student["student_id"],
                    "table_student_ids": [deleted_student["student_id"]],
                    "id_key": deleted_student["student_id"],
                    "name_key": deleted_student["full_name"],
                },
            }

        return {"success": False, "message": "Student not found."}

    def find_student_by_id(self, student_id):
        try:
            target_id = self._parse_student_id(student_id)
        except ValueError as exc:
            return {"success": False, "message": str(exc)}

        search_result = self.id_btree.search(target_id)
        if search_result["found"]:
            student = search_result["entry"]["value"]
            return {
                "success": True,
                "message": "Student found.",
                "student": student,
                "highlight": {
                    "table_student_id": student["student_id"],
                    "table_student_ids": [student["student_id"]],
                    "id_key": student["student_id"],
                },
            }

        return {"success": False, "message": "Student not found."}

    def find_students_by_name(self, full_name):
        full_name = str(full_name).strip()
        if not full_name:
            return {"success": False, "message": "Full name cannot be empty."}

        search_result = self.name_btree.search(full_name)
        if search_result["found"]:
            students = list(search_result["entry"]["value"])
            return {
                "success": True,
                "message": "Student found.",
                "students": students,
                "highlight": {
                    "table_student_ids": [student["student_id"] for student in students],
                    "name_key": search_result["entry"]["key"],
                },
            }

        return {"success": False, "message": "Student not found."}
