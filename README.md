# STUDENT B-TREE SYSTEM

A web-based student management system built with Flask, utilizing a degree-3 B-Tree as the core indexing structure.

Link demo: https://student-b-tree-system.onrender.com/

## OVERVIEW

This project demonstrates the application of B-Tree indexing in managing and querying student data, combined with real-time visualization of index structures.

## FEATURES

- Student insert, delete, and search operations  
- Dual indexing:
  - Student ID (primary index)
  - Full Name (secondary index)
- Real-time B-Tree visualization using D3.js  
- Synchronized table and index updates  
- Highlighted results for better interaction  

## TECH STACK

- Python, Flask  
- HTML, CSS, JavaScript  
- D3.js  

## NOTES

- Degree-3 B-Tree implementation  
- Supports duplicate keys in name index  
- Indexes are rebuilt after delete operations to ensure consistency  

## AUTHOR

Student project for B-Tree indexing and visualization.
