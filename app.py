from flask import Flask, render_template, request, redirect, url_for
from database import create_table, add_ride, get_all_rides, get_stats, get_reminder_status, set_reminder_days

app = Flask(__name__)

SKILL_TAGS = ["general", "hill climb", "cornering", "endurance"]


@app.route("/", methods=["GET"])
def index():
    rides = get_all_rides()
    stats = get_stats()
    reminder = get_reminder_status()
    return render_template("index.html", rides=rides, skill_tags=SKILL_TAGS, stats=stats, reminder=reminder)


@app.route("/settings", methods=["POST"])
def settings():
    days = int(request.form["reminder_days"])
    set_reminder_days(days)
    return redirect(url_for("index"))


@app.route("/add", methods=["POST"])
def add():
    distance_km = float(request.form["distance_km"])
    duration_min = float(request.form["duration_min"])
    skill_tag = request.form.get("skill_tag", "general")
    notes = request.form.get("notes", "")

    add_ride(distance_km, duration_min, skill_tag=skill_tag, notes=notes)
    return redirect(url_for("index"))


if __name__ == "__main__":
    create_table()
    app.run(debug=True)