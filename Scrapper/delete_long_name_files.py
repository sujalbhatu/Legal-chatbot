import os

folder_path = r".\scraped_pdf"

for filename in os.listdir(folder_path):
  file_path = os.path.join(folder_path, filename)
  name, ext = os.path.splitext(filename)
  if len(name) > 4:
    os.remove(file_path)
    print(f"Deleted: {filename}")