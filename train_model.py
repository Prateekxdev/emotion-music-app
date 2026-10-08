from pathlib import Path

import tensorflow as tf

# Resolve paths from this file so the script works from any current directory.
PROJECT_DIR = Path(__file__).resolve().parent
TRAIN_DIR = PROJECT_DIR / "dataset" / "train"
TEST_DIR = PROJECT_DIR / "dataset" / "test"
MODEL_PATH = PROJECT_DIR / "emotion_model.h5"
IMAGE_SIZE = (224, 224)
BATCH_SIZE = 32


def main():
    for data_dir in (TRAIN_DIR, TEST_DIR):
        if not data_dir.is_dir():
            raise FileNotFoundError(
                f"Training data folder not found: {data_dir}\n"
                "Expected dataset/train and dataset/test next to train_model.py, "
                "with one subfolder per emotion class."
            )

    train_classes = {path.name for path in TRAIN_DIR.iterdir() if path.is_dir()}
    test_classes = {path.name for path in TEST_DIR.iterdir() if path.is_dir()}
    if not train_classes:
        raise ValueError(f"No class folders found in {TRAIN_DIR}")
    if train_classes != test_classes:
        raise ValueError(
            "Training and test folders must contain the same class subfolders. "
            f"Missing from test: {sorted(train_classes - test_classes)}; "
            f"missing from train: {sorted(test_classes - train_classes)}"
        )

    class_names = sorted(train_classes)
    train_dataset = tf.keras.utils.image_dataset_from_directory(
        str(TRAIN_DIR),
        labels="inferred",
        label_mode="categorical",
        class_names=class_names,
        image_size=IMAGE_SIZE,
        batch_size=BATCH_SIZE,
        shuffle=True,
    )
    test_dataset = tf.keras.utils.image_dataset_from_directory(
        str(TEST_DIR),
        labels="inferred",
        label_mode="categorical",
        class_names=class_names,
        image_size=IMAGE_SIZE,
        batch_size=BATCH_SIZE,
        shuffle=False,
    )

    # Match the 0-1 pixel scaling used by the existing prediction pipeline.
    scale_pixels = lambda images, labels: (tf.cast(images, tf.float32) / 255.0, labels)
    autotune = tf.data.AUTOTUNE
    train_dataset = train_dataset.map(scale_pixels, num_parallel_calls=autotune).prefetch(autotune)
    test_dataset = test_dataset.map(scale_pixels, num_parallel_calls=autotune).prefetch(autotune)

    base_model = tf.keras.applications.MobileNetV2(
        weights="imagenet",
        include_top=False,
        input_shape=(*IMAGE_SIZE, 3),
    )
    base_model.trainable = False

    x = tf.keras.layers.GlobalAveragePooling2D()(base_model.output)
    x = tf.keras.layers.Dense(128, activation="relu")(x)
    output = tf.keras.layers.Dense(len(class_names), activation="softmax")(x)
    model = tf.keras.Model(base_model.input, output)

    model.compile(
        optimizer="adam",
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )
    model.fit(train_dataset, validation_data=test_dataset, epochs=10)
    model.save(MODEL_PATH)
    print(f"Training complete! Model saved as {MODEL_PATH}")


if __name__ == "__main__":
    main()
