p = "/opt/netpnl/infra/backend/.env"
with open(p, "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("SIMULATION_ALL_HOURS=true", "SIMULATION_ALL_HOURS=false")

with open(p, "w", encoding="utf-8") as f:
    f.write(content)

print("Updated /opt/netpnl/infra/backend/.env to SIMULATION_ALL_HOURS=false successfully.")

