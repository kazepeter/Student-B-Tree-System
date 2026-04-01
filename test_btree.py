from models.btree import BTree


tree = BTree(order=3, key_func=int)

for student_id in [24520003, 24520001, 24520002, 24520005, 24520004]:
    tree.insert(student_id, {"student_id": student_id})

print("CAY B-TREE:")
print(tree.to_dict())

print("\nTIM 24520002:")
print(tree.search(24520002))

print("\nTIM 99999999:")
print(tree.search(99999999))
