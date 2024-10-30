import requests

# 设置目标URL
url = "http://localhost:7123/get_kicad_project_bom_and_ports"

# 指定要上传的zip文件路径
file_path = "./power_sym_demo.zip"

# 打开zip文件并发送POST请求
with open(file_path, "rb") as f:
    files = {"file": f}
    response = requests.post(url, files=files)

# 输出服务器响应
print(response.status_code)
print(response.json())
