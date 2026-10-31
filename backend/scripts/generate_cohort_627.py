"""
Generates 627 authentic, diverse Pan-Indian trader personas for NetPnL / RetailTraders.
Saves the result to backend/app/simulation/cohort.py.
"""
import random
import sys

# Fixed seed for 100% deterministic reproducibility
rng = random.Random(20261025)

FIRST_NAMES_MALE = [
    "Aarav", "Abhay", "Abhinav", "Abhishek", "Aditya", "Ajay", "Akash", "Alok", "Aman", "Amit",
    "Anand", "Aniket", "Anirban", "Ankit", "Anshul", "Arjun", "Arun", "Arvind", "Ashish", "Ashok",
    "Ashwin", "Balaji", "Bharat", "Bhavesh", "Bhavik", "Bikram", "Chetan", "Chirag", "Deepak", "Devendra",
    "Dharmesh", "Dileep", "Dinesh", "Gaurav", "Gautam", "Girish", "Harish", "Harsh", "Hemant", "Himanshu",
    "Hiren", "Ishaan", "Jagdish", "Jayant", "Jayesh", "Jignesh", "Joy", "Kamal", "Kapil", "Karan",
    "Karthik", "Kaushik", "Ketan", "Kishore", "Krunal", "Kunal", "Lakshman", "Madhav", "Madhavan", "Mahesh",
    "Mandar", "Manish", "Manoj", "Mayur", "Mehul", "Milind", "Mohan", "Mohit", "Mukesh", "Murugan",
    "Naveen", "Nihar", "Nikhil", "Nilesh", "Nitin", "Omkar", "Pankaj", "Paresh", "Parth", "Pawan",
    "Piyush", "Pradeep", "Prakash", "Pranav", "Prasad", "Prashant", "Prateek", "Praveen", "Pritam", "Rahul",
    "Rajesh", "Rajiv", "Rakesh", "Ramesh", "Ravi", "Ritesh", "Rohan", "Rohit", "Sachin", "Sameer",
    "Sanjay", "Santhosh", "Santosh", "Saravanan", "Sathish", "Saurabh", "Senthil", "Shailesh", "Sharath", "Shashi",
    "Shirish", "Shravan", "Siddharth", "Somnath", "Sourav", "Subhash", "Subir", "Sudhir", "Suhas", "Sujit",
    "Sundar", "Sunil", "Suresh", "Swapnil", "Tanmay", "Tarun", "Tejas", "Tushar", "Umesh", "Vaibhav",
    "Varun", "Venkat", "Venkatesh", "Vignesh", "Vijay", "Vikas", "Vikram", "Vinay", "Vinod", "Vipul",
    "Vishal", "Vivek", "Yash", "Yogesh"
]

FIRST_NAMES_FEMALE = [
    "Aarti", "Aishwarya", "Akanksha", "Amrita", "Ananya", "Anita", "Anjali", "Ankita", "Anusha", "Aparna",
    "Archana", "Bhavna", "Deepa", "Deepika", "Divya", "Gayathri", "Geeta", "Harini", "Isha", "Jaya",
    "Kavita", "Keerthi", "Komal", "Lakshmi", "Madhavi", "Malini", "Meera", "Monika", "Nandini", "Neha",
    "Nidhi", "Nisha", "Pallavi", "Pavithra", "Payal", "Pooja", "Prerna", "Preeti", "Priya", "Radhika",
    "Rashmi", "Raveena", "Ritu", "Roshni", "Sakshi", "Sandhya", "Sangeeta", "Shalini", "Sheetal", "Shilpa",
    "Shivani", "Shreya", "Shweta", "Simran", "Sneha", "Sowmya", "Sujata", "Sunita", "Swati", "Tanvi",
    "Uma", "Vaishali", "Varsha", "Vidya"
]

LAST_NAMES = [
    # North / Central
    "Sharma", "Verma", "Gupta", "Singh", "Yadav", "Mishra", "Pandey", "Tiwari", "Shukla", "Agrawal",
    "Bansal", "Goyal", "Mittal", "Singhal", "Singhania", "Jain", "Maheshwari", "Khandelwal", "Saxena", "Srivastava",
    "Chauhan", "Rathore", "Bhatnagar", "Mathur", "Malhotra", "Kapoor", "Khanna", "Chopra", "Arora", "Bhatia",
    "Grover", "Sethi", "Bhasin", "Kohli", "Chawla", "Tandon", "Khurana",
    # West (Maharashtra & Gujarat)
    "Patel", "Shah", "Mehta", "Desai", "Bhatt", "Trivedi", "Parikh", "Vyas", "Oza", "Jani",
    "Thakar", "Gajjar", "Panchal", "Prajapati", "Kulkarni", "Deshpande", "Joshi", "Patil", "Pawar", "Shinde",
    "Bhosle", "Thorat", "Salunkhe", "More", "Jadhav", "Chavan", "Kadam", "Gaikwad", "Tambe", "Mane",
    "Savant", "Bhave", "Godbole", "Ranade", "Gadgil", "Kelkar", "Apte", "Vaze", "Chitre",
    # South (Tamil Nadu, Karnataka, Andhra, Telangana, Kerala)
    "Iyer", "Iyengar", "Raman", "Ramaswamy", "Subramanian", "Balakrishnan", "Natarajan", "Sundaram", "Swaminathan", "Venkatesan",
    "Krishnan", "Narayanan", "Raghavan", "Chandran", "Srinivasan", "Reddy", "Rao", "Chowdary", "Naidu", "Varma",
    "Murthy", "Hegde", "Shetty", "Kamath", "Bhat", "Prabhu", "Gowda", "Menon", "Nair", "Pillai",
    "Nambiar", "Kurup", "Warrier",
    # East (Bengal, Odisha, Assam)
    "Das", "Ghosh", "Mukherjee", "Chatterjee", "Banerjee", "Bhattacharya", "Chakraborty", "Sen", "Dey", "Dutta",
    "Roy", "Saha", "Bose", "Sarkar", "Mitra", "Biswas", "Majumdar", "Mahapatra", "Mishra", "Patnaik",
    "Mohanty", "Barik", "Pradhan", "Samal", "Nayak", "Borah", "Saikia", "Barua"
]

CITIES_AND_STYLES = [
    # Mumbai / MMR / Pune
    ("Mumbai", "BankNifty opening range breakouts. Risk 1%."),
    ("Mumbai", "Nifty weekly options seller. Theta decay focus."),
    ("Mumbai", "Scalping Bank Nifty momentum with 15-sec charts."),
    ("Mumbai", "Full-time options trader. Price action only."),
    ("Mumbai", "Index buyer. Strict SL trailing on 5-min chart."),
    ("Thane", "Part-time options buyer. Working on cutting losses."),
    ("Navi Mumbai", "BankNifty expiry day scalper."),
    ("Pune", "Tech lead by day, Nifty scalper by 9:15 AM."),
    ("Pune", "Mechanical options selling with strict stop loss."),
    ("Pune", "Strict 1:2 risk-to-reward. 2 lots max."),
    ("Nashik", "Swing trader in large-cap F&O. Disciplined risk."),
    ("Kolhapur", "Nifty buyer. Following VWAP bounces."),

    # Gujarat
    ("Ahmedabad", "Full-time option writer. Iron Condors & Strangle seller."),
    ("Ahmedabad", "Chemical business + part-time options trading."),
    ("Ahmedabad", "Bank Nifty momentum buyer. 1 lot discipline."),
    ("Surat", "Textile entrepreneur. Trading Bank Nifty expiry."),
    ("Surat", "Strict risk management. Target 1% per day."),
    ("Vadodara", "Swing trading + covered call writing."),
    ("Rajkot", "Pure price action. No lagging indicators."),

    # Bengaluru
    ("Bengaluru", "Senior Dev 💻 Index options scalper on 1-min chart."),
    ("Bengaluru", "Algorithmic & discretionary options seller."),
    ("Bengaluru", "Nifty expiry hero-zero & scalp specialist."),
    ("Bengaluru", "Systematic trend following on Nifty futures."),
    ("Bengaluru", "Trading for financial independence. 2 lots max."),

    # Delhi NCR
    ("Delhi", "Nifty 50 momentum buyer. Strict trailing SL."),
    ("Delhi", "Bank Nifty volatility trader. Managing risk first."),
    ("Gurugram", "Corporate strategist. Part-time options writer."),
    ("Gurugram", "0 DTE options buyer. Cutting losers fast."),
    ("Noida", "Scalping breakouts on opening bell."),
    ("Faridabad", "Index option buyer. Focus on risk-reward."),

    # Hyderabad / Telangana / AP
    ("Hyderabad", "IT consultant. Trading Bank Nifty support & resistance."),
    ("Hyderabad", "Mechanical credit spreads. Disciplined execution."),
    ("Hyderabad", "Index scalper. 3 trades a day rule."),
    ("Secunderabad", "Nifty options buyer. Learning not to overtrade."),
    ("Visakhapatnam", "Coastal city trader. Systematic F&O momentum."),
    ("Vijayawada", "Trading price action on 5-min candles."),

    # Chennai & Tamil Nadu
    ("Chennai", "Nifty weekly straddle seller. Chennai."),
    ("Chennai", "Disciplined price action. 1 trade, 1 SL."),
    ("Chennai", "Options scalper. Quick in, quick out."),
    ("Coimbatore", "Manufacturing engineer. Evening analysis, morning execution."),
    ("Madurai", "Options writer. Aiming for consistent theta capture."),
    ("Tiruchirappalli", "Learning the art of risk management."),

    # Kolkata & East
    ("Kolkata", "Nifty futures & options trader. Kolkata."),
    ("Kolkata", "Price action enthusiast. Chart patterns only."),
    ("Bhubaneswar", "Scalping Nifty morning momentum."),
    ("Cuttack", "Index options buyer. Strict position sizing."),
    ("Guwahati", "Trading Dalal Street from the Northeast."),

    # North & Central
    ("Jaipur", "Pink City trader. BankNifty opening 15-min range."),
    ("Jaipur", "Price action only. No indicators."),
    ("Indore", "Poha lover, Nifty options buyer. Strict SL."),
    ("Bhopal", "Trading with discipline. 2 lots."),
    ("Chandigarh", "Momentum scalper. High risk-reward setups."),
    ("Ludhiana", "Business owner. Trading index expiry moves."),
    ("Lucknow", "Nifty option seller. Capital preservation first."),
    ("Kanpur", "Index breakout trader. 1:2 RR."),
    ("Dehradun", "Trading peaceful mornings in Doon."),
    ("Kochi", "Kerala retail trader. Index buyer."),
    ("Thiruvananthapuram", "Systematic trend following on Nifty."),
]

ARCHETYPES = [
    ("options_buyer", 0.50),
    ("options_seller", 0.20),
    ("scalper", 0.18),
    ("expiry_gambler", 0.08),
    ("swing_trader", 0.04),
]

UPI_HANDLES = ["@okhdfcbank", "@oksbi", "@okicici", "@okaxis", "@paytm", "@ybl", "@upi"]


def generate_627_cohort() -> list[dict]:
    personas = []
    used_usernames = set()
    used_display_names = set()

    # Pre-select exactly 251 verified indexes out of 627 (approx 40%)
    # 251 / 627 = 40.03%
    VERIFIED_COUNT = 251
    TOTAL_COUNT = 627
    verified_indexes = set(rng.sample(range(TOTAL_COUNT), VERIFIED_COUNT))

    # Compile a pool of names
    all_names = []
    for fn in FIRST_NAMES_MALE + FIRST_NAMES_FEMALE:
        for ln in LAST_NAMES:
            all_names.append((fn, ln))
    rng.shuffle(all_names)

    name_idx = 0
    persona_idx = 0

    while len(personas) < TOTAL_COUNT:
        fn, ln = all_names[name_idx % len(all_names)]
        name_idx += 1
        display_name = f"{fn} {ln}"
        if display_name in used_display_names:
            continue

        # Formulate realistic username
        fn_lower = fn.lower()
        ln_lower = ln.lower()
        style_rand = rng.random()

        if style_rand < 0.35:
            username = f"{fn_lower}_{ln_lower}"
        elif style_rand < 0.60:
            username = f"{fn_lower}.{ln_lower}"
        elif style_rand < 0.75:
            username = f"{fn_lower}_{ln_lower[:2]}"
        elif style_rand < 0.88:
            username = f"{fn_lower}{ln_lower[:1]}"
        elif style_rand < 0.94:
            username = f"{fn_lower}_trades"
        else:
            username = f"{fn_lower}_fno"

        if username in used_usernames:
            username = f"{username}{rng.randint(2, 99)}"
        if username in used_usernames:
            continue

        used_usernames.add(username)
        used_display_names.add(display_name)

        # Avatar seed
        avatar_seed = f"{fn[0]}{ln[0]}"

        # Bio
        city, style_note = rng.choice(CITIES_AND_STYLES)
        bio = f"{city}. {style_note}"

        # UPI ID
        has_upi = rng.random() < 0.60
        upi_id = f"{fn_lower}{ln_lower[:3]}{rng.choice(UPI_HANDLES)}" if has_upi else None

        # Archetype selection
        arch_roll = rng.random()
        cumulative = 0.0
        chosen_archetype = "options_buyer"
        for arch, weight in ARCHETYPES:
            cumulative += weight
            if arch_roll <= cumulative:
                chosen_archetype = arch
                break

        # Activity probability
        activity_prob = round(rng.uniform(0.65, 0.85), 2)

        # 40% Verified broker
        is_verified = persona_idx in verified_indexes
        if is_verified:
            broker = "Upstox" if rng.random() < 0.52 else "Angel One"
        else:
            broker = None

        personas.append({
            "display_name": display_name,
            "username": username,
            "bio": bio,
            "avatar_seed": avatar_seed,
            "upi_id": upi_id,
            "archetype": chosen_archetype,
            "activity_prob": activity_prob,
            "verified_broker": broker,
        })
        persona_idx += 1

    return personas


if __name__ == "__main__":
    personas = generate_627_cohort()
    print(f"Generated {len(personas)} personas.")
    verified_count = sum(1 for p in personas if p["verified_broker"])
    print(f"Verified personas: {verified_count} ({round(verified_count / len(personas) * 100, 2)}%)")
    
    # Write cohort.py
    cohort_path = "app/simulation/cohort.py"
    with open(cohort_path, "w", encoding="utf-8") as f:
        f.write('"""\n627 Curated, Persistent Pan-India Trader Personas for NetPnL / RetailTraders.\n\nAll accounts represent authentic Indian retail trading personas with realistic\ndisplay names, handles, bios, archetypes, and trading behaviors.\n"""\nfrom __future__ import annotations\n\nfrom typing import TypedDict, Literal\n\nArchetype = Literal[\n    "options_buyer",\n    "options_seller",\n    "scalper",\n    "expiry_gambler",\n    "swing_trader",\n]\n\n\nclass Persona(TypedDict):\n    display_name: str\n    username: str\n    bio: str | None\n    avatar_seed: str\n    upi_id: str | None\n    archetype: Archetype\n    activity_prob: float\n    verified_broker: Literal["Upstox", "Angel One"] | None\n\n\nPERSONAS: list[Persona] = [\n')
        for p in personas:
            f.write(f"    {{\n")
            f.write(f"        \"display_name\": \"{p['display_name']}\",\n")
            f.write(f"        \"username\": \"{p['username']}\",\n")
            f.write(f"        \"bio\": \"{p['bio']}\",\n")
            f.write(f"        \"avatar_seed\": \"{p['avatar_seed']}\",\n")
            upi_val = f'"{p["upi_id"]}"' if p["upi_id"] else "None"
            f.write(f"        \"upi_id\": {upi_val},\n")
            f.write(f"        \"archetype\": \"{p['archetype']}\",\n")
            f.write(f"        \"activity_prob\": {p['activity_prob']},\n")
            broker_val = f'"{p["verified_broker"]}"' if p["verified_broker"] else "None"
            f.write(f"        \"verified_broker\": {broker_val},\n")
            f.write(f"    }},\n")
        f.write("]\n\n")
        f.write("assert len(PERSONAS) == 627, f\"Expected 627 personas, got {len(PERSONAS)}\"\n")
    print("Successfully wrote backend/app/simulation/cohort.py")
