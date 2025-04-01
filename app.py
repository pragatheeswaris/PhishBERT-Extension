from flask import Flask, request, jsonify
from flask_cors import CORS
import tensorflow as tf
import os

# Auto-detect model type
config_path = os.path.join("saved_model", "config.json")
with open(config_path) as f:
    import json
    config = json.load(f)
    model_type = config["model_type"]

if model_type == "distilbert":
    from transformers import DistilBertTokenizer, TFDistilBertForSequenceClassification
    tokenizer = DistilBertTokenizer.from_pretrained("distilbert-base-uncased")
    model_class = TFDistilBertForSequenceClassification
else:
    from transformers import BertTokenizer, TFBertForSequenceClassification
    tokenizer = BertTokenizer.from_pretrained("bert-base-uncased")
    model_class = TFBertForSequenceClassification

app = Flask(__name__)
CORS(app)

try:
    model = model_class.from_pretrained("saved_model")
    print("✅ Model loaded successfully")
except Exception as e:
    print(f"❌ Model loading failed: {str(e)}")
    raise

@app.route("/predict", methods=["POST"])
def predict():
    try:
        text = request.json["text"]
        inputs = tokenizer(text, return_tensors="tf", truncation=True, max_length=512)
        outputs = model(**inputs)
        prediction = tf.argmax(outputs.logits, axis=1).numpy()[0]
        return jsonify({"prediction": int(prediction)})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)