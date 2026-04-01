class BTreeNode:
    def __init__(self, leaf=True):
        self.leaf = leaf
        self.keys = []      
        self.children = []  # list[BTreeNode]


class BTree:
    """
    B-Tree bậc 3:
    - mỗi node tối đa 2 key
    - mỗi node nội bộ tối đa 3 con
    - split khi overflow thành 3 key
    """

    def __init__(self, order=3, key_func=None):
        if order != 3:
            raise ValueError("Project này cài đặt B-Tree bậc 3.")
        self.order = order
        self.max_keys = 2
        self.root = BTreeNode(leaf=True)
        self.key_func = key_func if key_func is not None else (lambda x: x)

    def _k(self, key):
        return self.key_func(key)

    def search(self, key, node=None):
        if node is None:
            node = self.root

        target = self._k(key)

        i = 0
        while i < len(node.keys) and target > self._k(node.keys[i]["key"]):
            i += 1

        if i < len(node.keys) and target == self._k(node.keys[i]["key"]):
            return {
                "found": True,
                "entry": node.keys[i],
                "node": node,
                "index": i
            }

        if node.leaf:
            return {
                "found": False,
                "entry": None,
                "node": node,
                "index": i
            }

        return self.search(key, node.children[i])

    def insert(self, key, value):
        existed = self.search(key)
        if existed["found"]:
            return False

        promoted = self._insert_recursive(self.root, {"key": key, "value": value})

        if promoted is not None:
            middle_entry, left_node, right_node = promoted
            new_root = BTreeNode(leaf=False)
            new_root.keys = [middle_entry]
            new_root.children = [left_node, right_node]
            self.root = new_root

        return True

    def _insert_recursive(self, node, entry):
        target = self._k(entry["key"])

        i = 0
        while i < len(node.keys) and target > self._k(node.keys[i]["key"]):
            i += 1

        if node.leaf:
            node.keys.insert(i, entry)

            if len(node.keys) <= self.max_keys:
                return None

            return self._split_overflow_node(node)

        promoted = self._insert_recursive(node.children[i], entry)

        if promoted is None:
            return None

        middle_entry, left_node, right_node = promoted

        node.keys.insert(i, middle_entry)
        node.children[i] = left_node
        node.children.insert(i + 1, right_node)

        if len(node.keys) <= self.max_keys:
            return None

        return self._split_overflow_node(node)

    def _split_overflow_node(self, node):
        mid = 1

        middle_entry = node.keys[mid]

        left_node = BTreeNode(leaf=node.leaf)
        right_node = BTreeNode(leaf=node.leaf)

        left_node.keys = node.keys[:mid]
        right_node.keys = node.keys[mid + 1:]

        if not node.leaf:
            left_node.children = node.children[:mid + 1]
            right_node.children = node.children[mid + 1:]

        return middle_entry, left_node, right_node

    def traverse(self, node=None, result=None):
        if result is None:
            result = []

        if node is None:
            node = self.root

        for i in range(len(node.keys)):
            if not node.leaf:
                self.traverse(node.children[i], result)
            result.append(node.keys[i])

        if not node.leaf:
            self.traverse(node.children[len(node.keys)], result)

        return result

    def to_dict(self, node=None):
        if node is None:
            node = self.root

        return {
            "leaf": node.leaf,
            "keys": [entry["key"] for entry in node.keys],
            "children": [self.to_dict(child) for child in node.children]
        }
