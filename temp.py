import numpy as np

def calculate_huber_loss(y_true, y_pred, delta=1.35):
    """
    Calculates the mean Huber Loss between true and predicted values.
    Note: 'delta' is often called 'delta' in Scikit-Learn.
    """
    # Step 1: Calculate the residual error
    error = y_true - y_pred
    
    # Check if the absolute error is less than or equal to delta (delta)
    is_small_error = np.abs(error) <= delta

    # Step 2: Calculate Quadratic loss for small errors
    squared_loss = 0.5 * (error ** 2)

    # Step 3: Calculate Linear loss for large errors (outliers)
    linear_loss = delta * np.abs(error) - 0.5 * (delta ** 2)

    # Step 4: Combine them based on the condition
    final_losses = np.where(is_small_error, squared_loss, linear_loss)
    
    # Step 5: Return the single average loss (scalar)
    return np.mean(final_losses)

# The Dataset
actual_values = np.array([1.5, 2.1, 3.2, 4.0, 20.0]) # 20.0 is our outlier
predicted_values = np.array([1.4, 2.7, 4.0, 5.2, 6.5]) # Dummy predictions


h_loss = calculate_huber_loss(actual_values, predicted_values, delta=1.35)
print(f" Huber Loss (From Scratch): {h_loss:.4f}")

# from sklearn.linear_model import HuberRegressor
# import numpy as np

# # Re-using the custom function since Scikit-Learn lacks a dedicated Huber metric
# def calculate_huber_loss(y_true, y_pred, epsilon=1.35):
#     error = y_true - y_pred
#     is_small_error = np.abs(error) <= epsilon
#     squared_loss = 0.5 * (error ** 2)
#     linear_loss = epsilon * np.abs(error) - 0.5 * (epsilon ** 2)
#     return np.mean(np.where(is_small_error, squared_loss, linear_loss))

# # The Dataset
# X = np.array([[1], [2], [3], [4], [5]]) 
# y_actual = np.array([1.5, 2.1, 3.2, 4.0, 20.0])

# # Step 1: Initialize and train the Scikit-Learn model
# huber_model = HuberRegressor(epsilon=1.35)
# huber_model.fit(X, y_actual)

# # Step 2: Let Scikit-Learn generate the predictions
# y_pred = huber_model.predict(X)

# # Step 3: Compute the loss using our function
# h_loss = calculate_huber_loss(y_actual, y_pred, epsilon=1.35)

# print(f"Final Huber Loss (Sklearn Model): {h_loss:.4f}")