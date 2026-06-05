with open('src/pages/SalesPage.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()
with open('src/pages/SalesPage.jsx', 'w', encoding='utf-8') as f:
    f.writelines(lines[:440])
print('Done. Kept', len(lines[:440]), 'lines')
